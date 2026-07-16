# Immo-Checker Remote MCP

MCP (Model Context Protocol) stellt accountgebundene Werkzeuge ueber Streamable HTTP bereit. Die Function implementiert MCP `2025-11-25` mit dem offiziellen TypeScript-SDK `1.29.0` und arbeitet zustandslos: Jeder HTTP-Request erhaelt einen frischen Transport.

## Sicherheitsmodell

- Supabase-OAuth-Access-Tokens werden als Bearer-JWTs (JSON Web Tokens) mit `auth.getClaims()` kryptografisch geprueft.
- `iss`, `aud`, `sub`, `client_id`, `role=authenticated` und der nur vom Access-Token-Hook gesetzte Claim `immo_checker_mcp=true` muessen passen.
- Danach bestaetigt die Function ueber den RLS-kontextgebundenen RPC `is_immo_checker_mcp()` erneut, dass `profile.approved=true` und der Grant fuer genau `(sub, client_id)` noch existiert. Ein Grant-Entzug sperrt daher auch ein noch nicht abgelaufenes Token.
- Datenbankzugriffe verwenden nur Publishable-/Anon-Key plus dasselbe Bearer-Token, niemals einen Service-Role-Key. Das ersetzt keine Gesamtpruefung der Projektrollen, anderer Tabellen oder der Deployment-Konfiguration.
- Der Agent gibt niemals `user_id` an. Beim Erstellen eines Drafts stammt sie nur aus dem geprueften `sub`-Claim.
- OAuth-Tokens koennen finale Szenarien nicht aendern oder loeschen und niemals Admin-RPCs ausfuehren. Es existiert kein Commit-Tool.
- Draft-Pfade, Typen, Wertebereiche, Extra-Keys, Textlaengen, SHA-256, ISO-Zeitstempel, JSON-Tiefe und Gesamtgroesse werden in Edge Function und SQL-Constraint geprueft.
- `scenarios.data` und `scenarios.analysis` sind jeweils auf 750 KB begrenzt; die Migration validiert die Constraints explizit gegen Bestandsdaten. Das Edge-Antwortlimit betraegt 2 MB.
- URLs in Quellen sind nur Metadaten. Die Function ruft keine vom Agenten gelieferte URL ab.

`verify_jwt = false` in `supabase/config.toml` ist beabsichtigt: Die Function muss Protected Resource Metadata oeffentlich ausliefern und selbst RFC-konforme `401`-Challenges erzeugen. Fehlende Credentials erhalten nur den Discovery-Challenge; vorhandene ungueltige Credentials zusaetzlich `error="invalid_token"`. Tool-Aufrufe werden trotzdem erst nach beiden Auth-Pruefungen ausgefuehrt.

## OAuth-Clients und Grants

Der OAuth-Server dieses Supabase-Projekts wird fuer diese Verbindung als Agent-Zugang behandelt. Zwei Client-Arten sind moeglich:

- DCR (Dynamic Client Registration, dynamische Client-Registrierung): Ein MCP-Host registriert sich am Supabase-OAuth-Server und erhaelt eine neue `client_id`.
- Vorregistrierung: Ein Betreiber legt den OAuth-Client vorher in Supabase an und verteilt dessen `client_id` an den MCP-Host.

Beide Varianten haben dieselben Rechte und benoetigen vor der OAuth-Freigabe einen expliziten Datensatz in `public.agent_oauth_grants`. Der Freigabedialog muss diesen Grant als direkte Web-Session vor `approveAuthorization` upserten:

```ts
await supabase.from('agent_oauth_grants').upsert(
  { user_id: session.user.id, client_id },
  { onConflict: 'user_id,client_id' },
);
```

Die Tabelle besitzt den Primaerschluessel `(user_id, client_id)` sowie `created_at` und `updated_at`. Ihre RLS-Policies erlauben Verwaltung nur dem freigegebenen Nutzer in einer direkten Web-Session. Ein OAuth-Token kann seinen eigenen Grant weder lesen noch erzeugen.

### Trennen und erneut verbinden

Die Web-App zeigt unter **Agent-Verbindungen** die Supabase-OAuth-Grants und die eigenen Eintraege aus `agent_oauth_grants` gemeinsam an. Beim Trennen gilt bewusst diese Reihenfolge:

1. Den Custom-Grant fuer exakt `(auth.uid(), client_id)` loeschen. Dadurch lehnen Edge Function und RLS auch noch nicht abgelaufene Tokens sofort ab.
2. Danach `supabase.auth.oauth.revokeGrant({ clientId })` aufrufen. Dadurch werden der OAuth-Grant, zugehoerige OAuth-Sessions und Refresh-Tokens widerrufen.

Scheitert Schritt 2, bleibt der Immo-MCP-Zugriff trotzdem gesperrt und die verbleibende OAuth-Freigabe wird in der Ansicht zur erneuten Bereinigung angezeigt. Ist nur ein Custom-Grant uebrig, kann er dort ebenfalls entfernt werden. Ist nur der OAuth-Grant vorhanden, muss er vor einem Reconnect widerrufen werden; andernfalls kann Supabase eine bereits genehmigte Anfrage ohne neuen Freigabedialog weiterleiten, waehrend das aktuelle MCP-Gate den Client weiterhin ablehnt.

## Einrichten

1. `supabase-agent-mcp.sql` im Supabase SQL Editor ausfuehren. Die Migration ist wiederholbar. Sie bricht vorab ab, wenn auf `profiles`, `scenarios`, `scenario_drafts` oder `agent_oauth_grants` eine unbekannte permissive RLS-Policy existiert; diese Policy muss zuerst bewusst geprueft und entfernt oder in die Migration uebernommen werden.
2. Fuer bestehende Installationen ausserdem `supabase-auth-admin-migration.sql` ausfuehren. Bei Neuinstallationen enthaelt `supabase-setup.sql` denselben OAuth-sicheren Admin-Check.
3. Unter **Authentication -> OAuth Server** den OAuth-Server aktivieren und den Immo-Checker-Authorization-Path konfigurieren. DCR je nach gewuenschtem Betriebsmodell aktivieren oder Clients vorregistrieren.
4. Einen asymmetrischen JWT-Signaturschluessel wie ES256 oder RS256 verwenden, damit `auth.getClaims()` gegen die veroeffentlichten Schluessel pruefen kann.
5. Die kanonische MCP-Resource-URI festlegen, beispielsweise:

   ```text
   https://PROJECT_REF.supabase.co/functions/v1/agent-mcp
   ```

6. Nur die feste Audience in SQL aktivieren:

   ```sql
   UPDATE public.agent_mcp_config
   SET enabled = true,
       audience = 'https://PROJECT_REF.supabase.co/functions/v1/agent-mcp',
       updated_at = now()
   WHERE id = true;
   ```

7. Unter **Authentication -> Hooks -> Custom Access Token Hook** `public.custom_access_token_hook` aktivieren. Normale Logins bleiben ein No-op; nur genehmigte `(user_id, client_id)` erhalten Audience und MCP-Claim.
8. Function-Konfiguration setzen. Eine feste Client-ID ist nicht mehr erforderlich:

   ```sh
   supabase secrets set \
     MCP_RESOURCE_URI=https://PROJECT_REF.supabase.co/functions/v1/agent-mcp \
     MCP_ALLOWED_ORIGINS=https://APP_HOST
   ```

   `SUPABASE_URL` und `SUPABASE_ANON_KEY` werden gehostet bereitgestellt; alternativ wird `SUPABASE_PUBLISHABLE_KEY` akzeptiert. Produktions-URLs muessen HTTPS verwenden. HTTP ist nur fuer `localhost`, `127.0.0.1` oder `::1` erlaubt. Credentials, Query und Fragment sind verboten. `SUPABASE_URL` und Eintraege in `MCP_ALLOWED_ORIGINS` muessen reine Origins sein. Requests ohne `Origin` bleiben fuer native MCP-Clients zulaessig; jeder vorhandene unbekannte `Origin` erhaelt `403`.
9. Deployen:

   ```sh
   supabase functions deploy agent-mcp
   ```

10. RFC 9728 bildet die Metadata-URL, indem `/.well-known/oauth-protected-resource` zwischen Origin und Resource-Pfad eingefuegt wird. Fuer das Beispiel aus Schritt 5 ist das:

    ```text
    https://PROJECT_REF.supabase.co/.well-known/oauth-protected-resource/functions/v1/agent-mcp
    ```

    Dieser oeffentliche `GET`-Pfad muss am Gateway oder Reverse Proxy auf dieselbe Edge Function geroutet werden. Als internes Proxy-Ziel akzeptiert die Function dafuer zusaetzlich den Supabase-kompatiblen Pfad `.../functions/v1/agent-mcp/.well-known/oauth-protected-resource`; beworben wird ausschliesslich die kanonische RFC-URL. Der nackte Supabase-Functions-Pfad stellt das benoetigte Root-Routing nicht automatisch bereit. Fuer eine interoperable Produktion deshalb einen kontrollierten Custom Host bzw. Reverse Proxy verwenden und dort MCP- sowie Well-Known-Pfad explizit routen.
11. Vor Produktion Rate Limits am Supabase-Gateway, Reverse Proxy oder WAF (Web Application Firewall) konfigurieren, mindestens pro IP sowie nach Moeglichkeit pro `client_id`/Konto. Ein In-Memory-Limiter in einer zustandslosen Edge Function ist keine verlaessliche Sicherheitsgrenze und wird deshalb nicht verwendet.

Die Migration kontrolliert die benannten RLS-Policies und Funktionspfade in ihrem Scope. Sie ist keine Behauptung, dass externe Gateway-, IAM-, OAuth- oder sonstige Projektkonfiguration automatisch Least Privilege erfuellt.

## Oeffentliche Metadaten und Werkzeuge

Protected Resource Metadata:

```text
https://PROJECT_REF.supabase.co/.well-known/oauth-protected-resource/functions/v1/agent-mcp
```

- `list_scenarios`: nur skalare Projektionen (`id`, Name, Zeitstempel und bei Drafts `revision`) auflisten.
- `get_scenario`: ein eigenes Szenario oder einen Draft lesen.
- `create_draft`: einen nur vorgemerkten Draft anlegen.
- `update_draft`: angegebene Top-Level-Felder mit der zuletzt gelesenen `revision` ersetzen; parallele Aenderungen liefern `revision_conflict` (CAS, Compare-and-Swap).
- `analyze_scenario`: nur die bereits gespeicherte `scenarios.analysis` lesen.

Angegebene Arrays in `update_draft` ersetzen das jeweilige Array vollstaendig. Vor einer Aenderung sollte der Agent den Draft erneut lesen. Die Function protokolliert weder Token noch Payload; bei Datenbankfehlern nur Operation und Fehlercode.
