# Zentra Discord Export Bot

Discord bot that exports a server's channels/messages/attachments and imports into Zentra.

## Features
- Slash command `/export_to_zentra`
- Exports channel structure + message history + attachment metadata
- Uploads to Zentra backend endpoint: `POST /api/v1/communities/import/discord`
- Replies in Discord with the generated Zentra invite URL

## Setup
1. Ensure backend is running on `http://localhost:8080`.
2. Set `DISCORD_IMPORT_TOKEN` in backend and bot to the same value.
3. Copy `.env.example` to `.env` and fill all required values.
4. Install and run:
   - `npm install`
   - `npm start`

## Slash Command
`/export_to_zentra owner_id:<zentra-user-uuid> [is_public] [is_open] [invite_max_uses] [invite_expires_sec] [max_messages_per_channel]`

- `owner_id` is required because Discord users are not automatically mapped to Zentra users.
- `max_messages_per_channel=0` means export all available history.

## Notes
- Discord category channels become Zentra categories inferred from each channel's `categoryName`.
- Unsupported Discord channel types are mapped to text-compatible channel records.
- Attachments are imported as URLs and metadata; file binaries are not re-uploaded by this bot.
