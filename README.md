# Zentra Discord Export Bot

Discord bot that exports a server's channels/messages/attachments and imports into Zentra.

## Usage

If you are not wanting to run your own instance of the bot, Zentra Main hosts an instance for you!

To use, simple invite the bot to your server via this link and type /export_to_zentra! That's it!
https://discord.com/oauth2/authorize?client_id=1221306509531680808

If you are not using the Zentra Main instance, you can also specify the arugments to import to a specific instance. The base_url is the instance API url, and import_token is the import token from the server admin.

## Custom Setup
1. Ensure backend is running on `http://localhost:8080`.
2. Set `DISCORD_IMPORT_TOKEN` in backend and bot to the same value.
3. Copy `.env.example` to `.env` and fill all required values.
4. Install and run:
   - `npm install`
   - `npm start`

## Slash Command
`/export_to_zentra owner_id:<zentra-user-uuid> [is_public] [is_open] [invite_max_uses] [invite_expires_sec] [max_messages_per_channel] [base_url] [import_token]`

- `owner_id` is required because Discord users are not automatically mapped to Zentra users.
- `max_messages_per_channel=0` means export all available history.
- `base_url` lets you target a custom Zentra server for a single import.
- `import_token` lets you use that server's import token for a single import.
- If `base_url` / `import_token` are omitted, defaults come from `.env` (`ZENTRA_BASE_URL` and `DISCORD_IMPORT_TOKEN`).

## Notes
- Discord category channels become Zentra categories inferred from each channel's `categoryName`.
- Unsupported Discord channel types are mapped to text-compatible channel records.
- Attachments are imported as URLs and metadata; file binaries are not re-uploaded by this bot.
