const { REST, Routes, Events, ActivityType } = require("discord.js");
require("dotenv").config();

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    client.user.setPresence({
      activities: [
        {
          name: "kick.com",
          type: ActivityType.Watching
        }
      ],
      status: "online"
    });

    const commands = [];
    client.commands.forEach(cmd => commands.push(cmd.data.toJSON()));

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    try {
      console.log("🔄 Refreshing application commands...");
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log("✅ Slash commands registered.");
    } catch (error) {
      console.error(error);
    }
  }
};
