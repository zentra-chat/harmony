import { ChannelType, PermissionFlagsBits } from 'discord.js';

function normalizeDiscordType(channel) {
  switch (channel.type) {
    case ChannelType.GuildAnnouncement:
      return 'announcement';
    case ChannelType.GuildForum:
      return 'forum';
    default:
      return 'text';
  }
}

function toNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapAttachment(attachment) {
  return {
    filename: attachment.name ?? 'attachment',
    url: attachment.url,
    size: attachment.size ?? 0,
    contentType: attachment.contentType ?? null,
    thumbnailUrl: attachment.proxyURL ?? null,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
  };
}

export async function fetchAllMessages(channel, maxMessagesPerChannel = 0) {
  const messages = [];
  let before;

  while (true) {
    const pageLimit = maxMessagesPerChannel > 0
      ? Math.min(100, maxMessagesPerChannel - messages.length)
      : 100;

    if (pageLimit <= 0) {
      break;
    }

    const page = await channel.messages.fetch({
      limit: pageLimit,
      ...(before ? { before } : {}),
    });

    if (page.size === 0) {
      break;
    }

    const batch = [...page.values()];
    messages.push(...batch);
    before = batch[batch.length - 1].id;

    if (page.size < pageLimit) {
      break;
    }

    if (maxMessagesPerChannel > 0 && messages.length >= maxMessagesPerChannel) {
      break;
    }
  }

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return messages;
}

export async function buildDiscordImportPayload({
  guild,
  ownerId,
  isPublic,
  isOpen,
  inviteMaxUses,
  inviteExpiresSec,
  maxMessagesPerChannel,
  onProgress,
}) {
  const channelsCollection = await guild.channels.fetch();
  const channels = [...channelsCollection.values()]
    .filter((channel) => channel && channel.type !== ChannelType.GuildCategory)
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

  if (onProgress) {
    await onProgress({
      phase: 'export-start',
      totalChannels: channels.length,
    });
  }

  const mappedChannels = [];

  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index];
    const channelData = {
      sourceId: channel.id,
      name: channel.name,
      type: normalizeDiscordType(channel),
      topic: toNullableString(channel.topic ?? null),
      categoryName: toNullableString(channel.parent?.name ?? null),
      categoryPosition: channel.parent?.rawPosition ?? null,
      position: channel.rawPosition ?? 0,
      isNsfw: Boolean(channel.nsfw),
      slowmodeSeconds: channel.rateLimitPerUser ?? 0,
      messages: [],
    };

    const textBased = channel.isTextBased?.() && !channel.isDMBased?.();
    if (!textBased) {
      mappedChannels.push(channelData);
      continue;
    }

    const canReadHistory = channel.permissionsFor?.(guild.members.me)?.has(PermissionFlagsBits.ReadMessageHistory);
    if (!canReadHistory) {
      mappedChannels.push(channelData);
      continue;
    }

    const channelMessages = await fetchAllMessages(channel, maxMessagesPerChannel ?? 0);

    channelData.messages = channelMessages.map((message) => ({
      sourceId: message.id,
      authorName: message.author?.username ?? null,
      authorDiscordId: message.author?.id ?? null,
      authorAvatarUrl: message.author?.displayAvatarURL?.({ size: 256 }) ?? null,
      content: message.content ?? '',
      createdAt: new Date(message.createdTimestamp).toISOString(),
      editedAt: message.editedTimestamp ? new Date(message.editedTimestamp).toISOString() : null,
      pinned: Boolean(message.pinned),
      replyToSourceId: message.reference?.messageId ?? null,
      attachments: [...message.attachments.values()].map(mapAttachment),
    }));

    mappedChannels.push(channelData);

    if (onProgress) {
      const messagesDone = mappedChannels.reduce((acc, c) => acc + c.messages.length, 0);
      const attachmentsDone = mappedChannels.reduce(
        (acc, c) => acc + c.messages.reduce((sum, m) => sum + m.attachments.length, 0),
        0,
      );
      await onProgress({
        phase: 'export-channel',
        channelName: channel.name,
        currentChannel: index + 1,
        totalChannels: channels.length,
        messagesDone,
        attachmentsDone,
      });
    }
  }

  const payload = {
    ownerId,
    guild: {
      name: guild.name,
      description: toNullableString(guild.description ?? null),
      iconUrl: guild.iconURL({ size: 1024, extension: 'png' }) ?? null,
      bannerUrl: guild.bannerURL({ size: 2048, extension: 'png' }) ?? null,
      isPublic: Boolean(isPublic),
      isOpen: Boolean(isOpen),
    },
    channels: mappedChannels,
    invite: {
      maxUses: inviteMaxUses ?? null,
      expiresIn: inviteExpiresSec ?? null,
    },
  };

  if (onProgress) {
    await onProgress({
      phase: 'export-complete',
      totalChannels: mappedChannels.length,
      messagesDone: mappedChannels.reduce((acc, c) => acc + c.messages.length, 0),
      attachmentsDone: mappedChannels.reduce(
        (acc, c) => acc + c.messages.reduce((sum, m) => sum + m.attachments.length, 0),
        0,
      ),
    });
  }

  return payload;
}
