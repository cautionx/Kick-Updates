const { EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const fetch = require('node-fetch');
const { getKickToken } = require('./KickAuth');
const db = new QuickDB();

function logKickDebug(message) {
  console.log(`\x1b[32m%s\x1b[0m`, message);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    const paddedHours = hours.toString().padStart(2, '0');
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  } else {
    return `${paddedMinutes}:${paddedSeconds}`;
  }
}

function formatViewers(num) {
  if (num >= 1000) {
    const rounded = Math.round(num / 100) / 10; // e.g. 10150 -> 10.2K
    return `${rounded}K`;
  }
  return num.toString();
}

async function kickStreamUpdates(client) {
  const allUpdates = (await db.all()).filter(u => u.id.startsWith('update_'));
  const token = await getKickToken();
const streamThumbnailPlaceholder = 'https://i.imgur.com/IuEgile.png';

  logKickDebug(`[KickUpdates] Checking ${allUpdates.length} update(s)`);

  for (const update of allUpdates) {
    const {
      guildId,
      channelId,
      streamerId,
      lastLive,
      lastStreamStartedAt,
      streamerName,
      roleId,
      customMessage,
      updateMessageId,
      lastStreamTitle,
      lastStreamThumbnail
    } = update.value;

    if (!guildId || !client.guilds.cache.has(guildId)) continue;
    const guild = client.guilds.cache.get(guildId);
    const channelObj = await guild.channels.fetch(channelId).catch(() => null);
    if (!channelObj) continue;

    const perms = channelObj.permissionsFor(guild.members.me);
    if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) continue;

    const content = `${roleId ? `<@&${roleId}> ` : ''}${customMessage || ''}`.trim() || null;

    try {
      const res = await fetch(`https://api.kick.com/public/v1/livestreams?broadcaster_user_id=${streamerId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
      });

      if (!res.ok) {
        console.warn(`[KickUpdates] Failed to fetch livestreams for ${streamerId}. Status: ${res.status}`);
        continue;
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        console.error(`[KickUpdates] Failed to parse JSON for ${streamerId}:`, e);
        continue;
      }

      const stream = data.data?.[0];

      if (stream) {
        const viewerCount = typeof stream.viewer_count === 'number' ? formatViewers(stream.viewer_count) : 'N/A';

        if (!lastLive) {
          logKickDebug(`[KickUpdates] Streamer ${streamerId} is live. Sending update.`);

          const embed = new EmbedBuilder()
            .setTitle(`${streamerName} is now live!`)
            .setURL(`https://kick.com/${streamerName}`)
            .setImage(stream.thumbnail || streamThumbnailPlaceholder)
            .setColor(0x53fc18)
            .setDescription(stream.stream_title || "N/A")
            .addFields(
              { name: "Category", value: stream.category?.name || "N/A", inline: true },
              { name: "Viewers", value: viewerCount, inline: true }
            );

          const button = new ButtonBuilder()
            .setLabel(`Watch ${streamerName} on Kick!`)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://kick.com/${streamerName}`);

          const botInvite = new ButtonBuilder()
            .setLabel(`Invite Kick App`)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/oauth2/authorize?client_id=1417703995996377191`);

          const row = new ActionRowBuilder().addComponents(button);
          const row2 = new ActionRowBuilder().addComponents(botInvite);

          const sentMessage = await channelObj.send({ content, embeds: [embed], components: [row, row2] });

          await db.set(update.id, {
            ...update.value,
            lastLive: true,
            lastStreamStartedAt: stream.started_at,
            lastStreamTitle: stream.stream_title,
            lastStreamThumbnail: stream.thumbnail,
            updateMessageId: sentMessage.id
          });
        } else if (updateMessageId) {
          const originalMessage = await channelObj.messages.fetch(updateMessageId).catch(() => null);
          if (originalMessage && originalMessage.embeds[0]) {
            const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
              .setFields(
                { name: "Category", value: stream.category?.name || "N/A", inline: true },
                { name: "Viewers", value: viewerCount, inline: true }
              );

            await originalMessage.edit({ embeds: [updatedEmbed], components: originalMessage.components });
          }
        }
      } else {
        if (lastLive && updateMessageId) {
          logKickDebug(`[KickUpdates] Streamer ${streamerId} went offline. Editing original update embed.`);

          const durationText = lastStreamStartedAt
            ? formatDuration(Date.now() - new Date(lastStreamStartedAt).getTime())
            : "N/A";

          const embed = new EmbedBuilder()
            .setTitle(`${streamerName} is now offline!`)
            .setURL(`https://kick.com/${streamerName}`)
            .setColor(0x53fc18)
            .setImage(lastStreamThumbnail || streamThumbnailPlaceholder)
            .setDescription("You can still watch their past broadcasts, click the button below!")
            .addFields(
              { name: "Duration", value: durationText, inline: false },
              { name: "Stream Title", value: lastStreamTitle || "N/A", inline: false }
            );

          const button = new ButtonBuilder()
            .setLabel(`Missed the stream? Watch it on Kick!`)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://kick.com/${streamerName}`);

          const botInvite = new ButtonBuilder()
            .setLabel(`Invite Kick Updates`)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/oauth2/authorize?client_id=1417703995996377191`);

          const row = new ActionRowBuilder().addComponents(button);
          const row2 = new ActionRowBuilder().addComponents(botInvite);

          const originalMessage = await channelObj.messages.fetch(updateMessageId).catch(() => null);
          if (originalMessage) {
            await originalMessage.edit({ embeds: [embed], components: [row, row2] });
          }

          await db.set(update.id, {
            ...update.value,
            lastLive: false,
            lastStreamStartedAt: null,
            lastStreamTitle: null,
            lastStreamThumbnail: null
          });
        }
      }
    } catch (err) {
      console.error(`[KickUpdates] Error fetching stream for ${streamerId}:`, err);
    }
  }
}

module.exports = { kickStreamUpdates };
