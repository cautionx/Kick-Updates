const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const { QuickDB } = require('quick.db');
const { getKickToken } = require('../KickAPI/KickAuth');
const db = new QuickDB();

function logKickDebug(message) {
  console.log(`\x1b[32m%s\x1b[0m`, message);
}

function createEmbed(title, description = '', color = 0x53fc18) {
  const embed = new EmbedBuilder().setTitle(title).setColor(color);
  if (description) embed.setDescription(description);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('Manage Kick stream updates')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a Kick stream update')
        .addStringOption(opt => opt.setName('streamer').setDescription('Kick streamer name').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Discord channel for updates').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Optional role to mention'))
        .addStringOption(opt => opt.setName('message').setDescription('Optional custom message'))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Remove a Kick stream update')
        .addStringOption(opt => opt.setName('streamer').setDescription('Kick streamer name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View all Kick stream updates')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      const token = await getKickToken();

      if (subcommand === 'add') {
        const slug = interaction.options.getString('streamer');
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const message = interaction.options.getString('message');

        const res = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: '*/*' }
        });

        if (!res.ok) {
          const embed = createEmbed('Kick API Error', `Status: ${res.status}`, 0xed4345);
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const data = await res.json();
        const streamer = data.data?.[0];
        if (!streamer) {
          const embed = createEmbed('Streamer Not Found', `No streamer found with name \`${slug}\``, 0xed4345);
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const updateKey = `update_${guildId}_${streamer.broadcaster_user_id}`;
        await db.set(updateKey, {
          guildId,
          channelId: channel.id,
          streamerId: streamer.broadcaster_user_id,
          streamerName: streamer.slug,
          lastLive: false,
          categoryName: streamer.category?.name || "N/A",
          roleId: role?.id || null,
          customMessage: message || null,
          updateMessageId: null
        });

        logKickDebug(`[KickUpdates] Update set for ${streamer.slug} (Guild: ${guildId})`);
        const embed = createEmbed(
          'Update Added',
          `[**${streamer.slug}**](https://kick.com/${streamer.slug}) has been added to your updates.`
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

      } else if (subcommand === 'delete') {
        const slug = interaction.options.getString('streamer');
        const res = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: '*/*' }
        });
        const data = await res.json();
        const streamer = data.data?.[0];
        if (!streamer) {
          const embed = createEmbed('Streamer Not Found', `No streamer found with name \`${slug}\``, 0xed4345);
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const updateKey = `update_${guildId}_${streamer.broadcaster_user_id}`;
        const update = await db.get(updateKey);
        if (!update) {
          const embed = createEmbed('Update Not Found', `No update found for \`${slug}\` in this guild.`, 0xed4345);
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        await db.delete(updateKey);
        logKickDebug(`[KickUpdates] Deleted update for ${streamer.slug} (Guild: ${guildId})`);
        const embed = createEmbed('Update Deleted', `Stream update deleted for **${streamer.slug}**.`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

} else if (subcommand === 'view') {
  const allKeys = await db.all();
  const updates = allKeys
    .filter(a => a.id.startsWith(`update_${guildId}_`))
    .map(a => a.value);

  if (!updates.length) {
    const embed = createEmbed('No Updates', 'No Kick updates set for this guild.', 0xed4345);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Function to format viewer count
  const formatViewers = (num) => {
    if (num >= 1000) {
      return (Math.round(num / 100) / 10) + 'K'; // e.g., 10234 -> 10.2K
    }
    return num.toString();
  };

  const token = await getKickToken();
  const formatted = await Promise.all(updates.map(async (a, i) => {
    const index = i + 1;
    let viewerText = '';
    try {
      const res = await fetch(`https://api.kick.com/public/v1/livestreams?broadcaster_user_id=${a.streamerId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "*/*" }
      });
      if (res.ok) {
        const data = await res.json();
        const stream = data.data?.[0];
        if (stream) {
          viewerText = ` ${formatViewers(stream.viewer_count)}`;
        }
      }
    } catch (e) {
      console.error(`Failed to fetch viewers for ${a.streamerName}:`, e);
    }

const status = a.lastLive ? '<:LIVE:1418417676228890794>' : 'Offline';
const categoryName = a.lastLive && a.categoryName ? a.categoryName : null; 
const categoryLink = categoryName
  ? `[${categoryName}](https://kick.com/category/${categoryName.toLowerCase().replace(/\s+/g, '-')})`
  : null;
return a.lastLive
  ? `\` ${index} \` [**${a.streamerName}**](https://kick.com/${a.streamerName})${status}${viewerText} _ _${categoryLink}`
  : `\` ${index} \` [**${a.streamerName}**](https://kick.com/${a.streamerName})`;
  }));

  const embed = createEmbed(`Active Kick Updates`, formatted.join('\n'));
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

    } catch (err) {
      console.error(err);
      const embed = createEmbed('Error', `An error occurred: ${err.message}`, 0xed4345);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};
