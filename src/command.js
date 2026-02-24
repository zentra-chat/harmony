import { SlashCommandBuilder } from 'discord.js';

export const EXPORT_COMMAND = new SlashCommandBuilder()
  .setName('export_to_zentra')
  .setDescription('Export this Discord server into Zentra')
  .addStringOption((option) =>
    option
      .setName('owner_id')
      .setDescription('Target Zentra owner UUID')
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName('is_public')
      .setDescription('Set imported Zentra community public (default: false)'),
  )
  .addBooleanOption((option) =>
    option
      .setName('is_open')
      .setDescription('Set imported Zentra community open join (default: false)'),
  )
  .addIntegerOption((option) =>
    option
      .setName('invite_max_uses')
      .setDescription('Invite max uses (optional)')
      .setMinValue(1)
      .setMaxValue(10000),
  )
  .addIntegerOption((option) =>
    option
      .setName('invite_expires_sec')
      .setDescription('Invite expiration in seconds (optional)')
      .setMinValue(60)
      .setMaxValue(2592000),
  )
  .addIntegerOption((option) =>
    option
      .setName('max_messages_per_channel')
      .setDescription('0 = all messages (default: 0)')
      .setMinValue(0)
      .setMaxValue(200000))
  .addStringOption((option) =>
    option
      .setName('base_url')
      .setDescription('Optional Zentra server base URL override for this run')
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('import_token')
      .setDescription('Optional import token override for this run')
      .setRequired(false),
  );
