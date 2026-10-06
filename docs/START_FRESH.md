# Testing before Summer starts

You can test the starting check and daily lessons with the parent account. Before Summer uses the app, open the parent lock, enter your six-digit PIN, then choose **Testing before Summer starts → Start fresh → Yes, start fresh**.

This removes all previous starting checks, follow-up checks, daily lesson results and remembered strategies from active progress. Summer can take a new starting check. Her four-week clock begins again with her first completed normal lesson. Sign-in, the parent PIN and spending reservations stay in place.

Previous assessment marks and reading records are archived, rather than rewritten or deleted. Archived audio still follows its existing 30-day expiry. Archived records do not appear in active parent reports or influence the tutor. A reset does not refund OpenAI usage or the app's conservative monthly reservations.

If the control asks for a database update, choose **Copy database update** in the parent area. Paste it into your Supabase project's **SQL Editor → New query**, then click **Run**. Refresh the app afterwards. This bundle installs the daily tutor and reset migrations; running the SQL does not clear results. Only the confirmed Start fresh action does that.

The reset is atomic and restricted to the signed-in family. Its request ID makes retries safe after a lost response. Existing assessment evidence remains immutable, and older open sessions cannot write more results after being archived.

Validation: `npm run typecheck`, `npm test`, `npm run build`; disposable PostgreSQL checks in `tests/start-fresh.sql` after `supabase/schema.sql` and both migrations. Production migration installation and parent-device interaction require the parent account.
