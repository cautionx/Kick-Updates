const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs"), path = require("path");
require("dotenv").config();
const { kickStreamUpdates } = require('./KickAPI/KickUpdates');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.commands = new Collection();

const getFiles = d => fs.readdirSync(d,{withFileTypes:true})
  .flatMap(f => f.isDirectory() ? getFiles(path.join(d,f.name)) : f.name.endsWith(".js") ? [path.join(d,f.name)] : []);

for (const f of getFiles(path.join(__dirname,"Commands"))) {
  const c = require(f); if (c?.data?.name) client.commands.set(c.data.name, c);
}

for (const f of getFiles(path.join(__dirname,"Events"))) {
  const e = require(f); if (e?.name && e?.execute) client[e.once?"once":"on"](e.name, (...a)=>e.execute(...a,client));
}
setInterval(() => kickStreamUpdates(client), 60_000); // loop which will check every 60 seconds if streamer is online/offline.

client.login(process.env.DISCORD_TOKEN);
