const { SlashCommandBuilder } = require('discord.js');
const { exec } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

function makeTmpFile(prefix, suffix, tmpdir) {
    prefix = (typeof prefix !== 'undefined') ? prefix : 'tmp.';
    suffix = (typeof suffix !== 'undefined') ? suffix : '';
    tmpdir = tmpdir ? tmpdir : os.tmpdir();
    return path.join(tmpdir, prefix + crypto.randomBytes(16).toString('hex') + suffix);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zdis')
        .setDescription('calls zdis')
        .addStringOption(option =>
            option.setName('bytes')
                .setDescription('Hex bytes')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('arch')
                .setDescription('Which CPU arch')
                .setRequired(false)
                .addChoices(
                    { name: 'z80 (adl=0)',   value: 'z80' },
                    { name: 'ez80 (adl=1)',  value: 'ez80' }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        const arch = interaction.options.getString('arch') ?? 'ez80';
        const bytes = interaction.options.getString('bytes').trim();

        if (!/^[0-9A-Fa-f]+$/g.test(bytes)) {
            await interaction.reply("Invalid hex input");
            return;
        }

        const tmpFile = makeTmpFile();
        if (!tmpFile) {
            await interaction.reply("Error creating tmpFile");
            return;
        }

        fs.writeFileSync(tmpFile, Buffer.from(bytes, "hex"))

        const destStyle = (arch === 'ez80') ? 'explicit-dest' : 'implicit-dest';

        let asmOutput = "";
        const cmd = `./zdis/cli --${arch} --${destStyle} --mnemonic-tab ${tmpFile}`;

        exec(cmd, (err, stdout, stderr) => {
            // if (stdout.length) console.log('[zdisBot] stdout is:' + stdout);
            if (stderr.length) console.log('[zdisBot] stderr is:' + stderr);

            if (err) console.log('[zdisBot] error is:' + err);
            else asmOutput = stdout.replaceAll(/^(    |\t)/mg, '').replaceAll('    ', '\t');

            fs.unlinkSync(tmpFile);
            if (asmOutput.length) {
                interaction.editReply(`\`${arch}\` disassembly of \`${bytes}\`:\n\`\`\`avrasm\n${asmOutput.trimEnd()}\`\`\``);
            } else {
                interaction.editReply(`Error getting the disasm`);
            }
        });
    },
};