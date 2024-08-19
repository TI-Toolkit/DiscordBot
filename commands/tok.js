const tokData = require("../tokens.json");
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const capitalizeFirstLetter = function(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

const tokDataByName = {};
for (const [bytes, data] of Object.entries(tokData)) {
    data.bytes = bytes;
    tokDataByName[data.name] = data;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tok')
        .setDescription('Gives token info')
        .addStringOption(option =>
            option.setName('token')
                .setDescription('Name of the token, or its 0xNNNN hex bytes')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const wanted = interaction.options.getFocused().toLowerCase();
        let filtered = [];
        for (const [name, tok] of Object.entries(tokDataByName)) {
            if (name.trim().length && name.toLowerCase().includes(wanted)
                || tok.accessibleName?.toLowerCase().includes(wanted)
                || tok.bytes.toLowerCase().includes(wanted))
            {
                filtered.push(tok)
            }
        }
        filtered = filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 10);
        await interaction.respond(
            filtered.map(choice => ({ name: `${choice.name} (${choice.bytes})`, value: choice.bytes })),
        );
    },

    async execute(interaction) {
        const tokWanted = interaction.options.getString('token');
        const token = structuredClone(tokData[tokWanted] ?? tokData['0x'+tokWanted.substring(2).toUpperCase()] ?? tokDataByName[tokWanted] ?? null);
        if (token) {
            const embeds = [];

            {
                const fields = [];

                fields.push({
                    name: 'Bytes',
                    value: `**\`${token.bytes}\`**`,
                    inline: true
                });

                if ('accessibleName' in token && token.accessibleName !== token.name)
                {
                    fields.push({
                        name: 'Accessible',
                        value: `**\`${token.accessibleName}\`**`,
                        inline: true
                    });
                }

                if ('since' in token || 'until' in token)
                {
                    let historyStr = '';
                    const sinceUntilLines = [];
                    const multipleSinceUntil = Object.keys(token.since ?? {}).length > 1 || Object.keys(token.until ?? {}).length > 1;
                    // handle potential renamings...
                    for (let [model, sinceVer] of Object.entries(token.since ?? [])) {
                        let untilVer = token.until && token.until[model];
                        if (untilVer) {
                            let sinceNameInVer, untilNameInVer;
                            [sinceVer, sinceNameInVer = token.name] = sinceVer.split('|');
                            [untilVer, untilNameInVer = token.name] = untilVer.split('|');
                            if (sinceVer === untilVer && sinceNameInVer !== untilNameInVer) {
                                // console.log(`renaming detected in ${model}, at version ${sinceVer}: [${untilNameInVer}] => [${sinceNameInVer}]`);
                                sinceUntilLines.push(`- **${model}** ${sinceVer}: Renamed \`${untilNameInVer.replace(/`/g, '\\`')}\` to \`${sinceNameInVer.replace(/`/g, '\\`')}\``);
                                delete token.since[model];
                                delete token.until[model];
                            }
                        }
                    }
                    // process each remaining item
                    for (const [which, action] of Object.entries({ since: 'added', until: 'removed' })) {
                        for (const [model, ver] of Object.entries(token[which] ?? [])) {
                            const [actualVer, nameInVer = token.name] = ver.split('|');
                            sinceUntilLines.push(`- **${model}** ${actualVer}: ` + (multipleSinceUntil ? `\`${nameInVer.replace(/`/g, '\\`')}\` ` : '') + (multipleSinceUntil ? action : capitalizeFirstLetter(action)));
                        }
                    }

                    sinceUntilLines.sort((a, b) => a.localeCompare(b)).forEach((line) => { historyStr += line + '\n'; });

                    fields.push({
                        name: 'History',
                        value: historyStr,
                        inline: false
                    })
                }

                embeds.push(new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`\`${token.name}\``)
                    .setURL(`https://ti-toolkit.github.io/tokens-wiki/tokens/${token.bytes}.html`)
                    .addFields(...fields));
            }

            for (const s of token.syntaxes) {
                let args = "";
                for (const arg of s.arguments) {
                    args += `**\`${arg[0]}\`**: ${arg[1]}\n`;
                }
                const fields = [];
                if ('location' in s && s.location.length) {
                    fields.push({
                        name: "Location",
                        value: "`" + s.location.join('` ➔ `') + "`",
                        inline: false
                    })
                }
                if ('comment' in s && s.comment.length) {
                    fields.push({
                        name: "Comment",
                        value: s.comment,
                        inline: false
                    });
                }
                if (s.syntax !== token.name || s.description.length || fields.length) {
                    embeds.push(new EmbedBuilder()
                        .setTitle(`\`${s.syntax}\``)
                        .setDescription(s.description.length ? s.description : null)
                        .addFields(...fields));
                }
            }

            await interaction.reply({ embeds: embeds });
        } else {
            await interaction.reply(`Could not find token "${tokWanted}"!`);
        }
    },
};