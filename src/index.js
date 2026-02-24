import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  DiscordAPIError,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
} from 'discord.js';
import { EXPORT_COMMAND } from './command.js';
import { buildDiscordImportPayload } from './exporter.js';
import { toAbsoluteInviteUrl, uploadDiscordImport, ZentraAPIError } from './zentra-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function logInfo(message, context = {}) {
  console.log(`[zentra-bot] ${message}`, context);
}

function logError(message, context = {}) {
  console.error(`[zentra-bot] ${message}`, context);
}

function isUnknownInteractionError(error) {
  return error instanceof DiscordAPIError && error.code === 10062;
}

async function safeRespond(interaction, message) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(message);
    return;
  }

  await interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral,
  });
}

function normalizeBaseUrl(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getRuntimeConfig() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  const commandScope = (process.env.DISCORD_COMMAND_SCOPE || 'global').toLowerCase();

  const defaultImportToken = process.env.DISCORD_IMPORT_TOKEN;
  const defaultZentraBaseUrl = process.env.ZENTRA_BASE_URL || 'http://localhost:8080';

  if (!token) {
    throw new Error('Missing DISCORD_BOT_TOKEN.');
  }
  if (!clientId) {
    throw new Error('Missing DISCORD_CLIENT_ID.');
  }
  if (!['global', 'guild'].includes(commandScope)) {
    throw new Error('DISCORD_COMMAND_SCOPE must be either global or guild.');
  }
  if (commandScope === 'guild' && !guildId) {
    throw new Error('DISCORD_GUILD_ID is required when DISCORD_COMMAND_SCOPE=guild.');
  }
  if (defaultImportToken && defaultImportToken.length > 512) {
    throw new Error('DISCORD_IMPORT_TOKEN is too long.');
  }

  const normalizedDefaultBaseUrl = normalizeBaseUrl(defaultZentraBaseUrl);
  if (!normalizedDefaultBaseUrl) {
    throw new Error('Invalid ZENTRA_BASE_URL. Use a valid http(s) URL.');
  }

  return {
    token,
    clientId,
    guildId,
    commandScope,
    defaultImportToken,
    defaultZentraBaseUrl: normalizedDefaultBaseUrl,
  };
}

async function registerCommand({ token, clientId, guildId, commandScope }) {
  const rest = new REST({ version: '10' }).setToken(token);

  if (commandScope === 'guild') {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [EXPORT_COMMAND.toJSON()],
    });
    console.log(`Guild command registered for guild ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), {
    body: [EXPORT_COMMAND.toJSON()],
  });
  console.log('Global command registered. It may take a few minutes to appear in Discord.');
}

async function run() {
  const config = getRuntimeConfig();

  await registerCommand(config);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot ready as ${readyClient.user.tag}`);
  });

  client.on('error', (error) => {
    logError('Discord client error', { message: error.message });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName !== 'export_to_zentra') {
      return;
    }

    try {
      if (!interaction.inGuild()) {
        await interaction.reply({ content: 'Run this command in a server.', flags: MessageFlags.Ephemeral });
        return;
      }

      const hasPerms = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasPerms) {
        await interaction.reply({ content: 'You need Manage Server permission.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const startedAt = Date.now();
      let lastProgressAt = 0;

      async function updateProgress(text, force = false) {
        const now = Date.now();
        if (!force && now-lastProgressAt < 1500) {
          return;
        }
        lastProgressAt = now;
        await safeRespond(interaction, text);
      }

      await updateProgress('Starting export...', true);

      const ownerId = interaction.options.getString('owner_id', true);
      const isPublic = interaction.options.getBoolean('is_public') ?? false;
      const isOpen = interaction.options.getBoolean('is_open') ?? false;
      const inviteMaxUses = interaction.options.getInteger('invite_max_uses');
      const inviteExpiresSec = interaction.options.getInteger('invite_expires_sec');
      const maxMessagesPerChannel = interaction.options.getInteger('max_messages_per_channel') ?? 0;
      const commandBaseUrl = interaction.options.getString('base_url');
      const commandImportToken = interaction.options.getString('import_token');

      const normalizedCommandBaseUrl = normalizeBaseUrl(commandBaseUrl);
      if (commandBaseUrl && !normalizedCommandBaseUrl) {
        await safeRespond(
          interaction,
          'Import failed: invalid base_url. Provide a full URL like https://community.example.com',
        );
        return;
      }

      const zentraBaseUrl = normalizedCommandBaseUrl || config.defaultZentraBaseUrl;

      const importToken = commandImportToken || config.defaultImportToken;
      if (!importToken) {
        await safeRespond(
          interaction,
          'Import failed: missing import token. Set DISCORD_IMPORT_TOKEN in .env or pass import_token in the command.',
        );
        return;
      }

      const payload = await buildDiscordImportPayload({
        guild: interaction.guild,
        ownerId,
        isPublic,
        isOpen,
        inviteMaxUses,
        inviteExpiresSec,
        maxMessagesPerChannel,
        onProgress: async (progress) => {
          if (progress.phase === 'export-start') {
            await updateProgress(`Exporting channels... 0/${progress.totalChannels}`, true);
            return;
          }
          if (progress.phase === 'export-channel') {
            await updateProgress(
              `Exporting channels... ${progress.currentChannel}/${progress.totalChannels}\n` +
              `Current: #${progress.channelName}\n` +
              `Messages: ${progress.messagesDone}, Attachments: ${progress.attachmentsDone}`,
            );
            return;
          }
          if (progress.phase === 'export-complete') {
            await updateProgress(
              `Export complete. Uploading to Zentra...\n` +
              `Channels: ${progress.totalChannels}, Messages: ${progress.messagesDone}, Attachments: ${progress.attachmentsDone}`,
              true,
            );
          }
        },
      });

      const payloadStats = {
        channels: payload.channels.length,
        messages: payload.channels.reduce((acc, channel) => acc + channel.messages.length, 0),
        attachments: payload.channels.reduce(
          (acc, channel) => acc + channel.messages.reduce((sum, message) => sum + message.attachments.length, 0),
          0,
        ),
      };

      logInfo('Starting Discord -> Zentra import', {
        guildId: interaction.guild.id,
        guildName: interaction.guild.name,
        ownerId,
        zentraBaseUrl,
        tokenSource: commandImportToken ? 'command' : 'env',
        payloadStats,
      });

      const imported = await uploadDiscordImport({
        baseUrl: zentraBaseUrl,
        importToken,
        payload,
      });

      logInfo('Import completed successfully', {
        guildId: interaction.guild.id,
        communityId: imported.community?.id,
        importedCounts: imported.importedCounts,
        durationMs: Date.now() - startedAt,
      });

      const inviteAbsolute = toAbsoluteInviteUrl(zentraBaseUrl, imported.inviteUrl);
      const counts = imported.importedCounts || { channels: 0, messages: 0, attachments: 0 };

      await interaction.editReply(
        `Import complete.\n` +
        `Community: ${imported.community?.name || 'Imported Community'}\n` +
        `Channels: ${counts.channels}, Messages: ${counts.messages}, Attachments: ${counts.attachments}\n` +
        `Invite: ${inviteAbsolute || imported.inviteCode}`,
      );
    } catch (error) {
      if (isUnknownInteractionError(error)) {
        logError('Interaction expired before acknowledgement', {
          interactionId: interaction.id,
          commandName: interaction.commandName,
        });
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown interaction error';

      if (error instanceof ZentraAPIError) {
        logError('Import request failed', {
          status: error.status,
          url: error.url,
          details: error.details,
        });

        if (error.details?.error === 'Discord import is not configured') {
          await safeRespond(
            interaction,
            'Import failed: Zentra backend Discord import is not configured. ' +
            'Set DISCORD_IMPORT_TOKEN in backend env and restart backend, then try again.',
          );
          return;
        }
      } else {
        logError('Interaction handler failure', {
          interactionId: interaction.id,
          commandName: interaction.commandName,
          message,
        });
      }

      try {
        await safeRespond(interaction, `Import failed: ${message}`);
      } catch (respondError) {
        logError('Failed to send interaction error response', {
          message: respondError instanceof Error ? respondError.message : 'Unknown response error',
        });
      }
    }
  });

  await client.login(config.token);

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down bot...`);
    try {
      await client.destroy();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logError('Unhandled promise rejection', { reason });
});

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
