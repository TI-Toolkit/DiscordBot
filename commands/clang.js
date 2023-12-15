const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
        .setName('clang')
        .setDescription('calls (ez80)clang')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('Source code')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('opt')
                .setDescription('Optimization level')
                .setRequired(false)
                .addChoices(
                    { name: '0',  value: '0' },
                    { name: '1',  value: '1' },
                    { name: '2',  value: '2' },
                    { name: '3',  value: '3' },
                    { name: 'z',  value: 'z' }
                ))
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('Language')
                .setRequired(false)
                .addChoices(
                    { name: 'C',  value: 'c -std=gnu11' },
                    { name: 'C++',  value: 'c++ -std=gnu++2b -fno-exceptions -fno-use-cxa-atexit' }
                ))
        .addStringOption(option =>
            option.setName('target')
                .setDescription('Name of the target')
                .setRequired(false)
                .addChoices(
                    { name: 'z80',   value: 'z80' },
                    { name: 'z180',  value: 'z180' },
                    { name: 'ez80',  value: 'ez80' }
                )),

    async execute(interaction) {
        if (interaction.user.tag !== 'adriweb') {
            if ((interaction.guildId != 432891584451706892)
                || !interaction.member.roles.cache.some(r => r.name === "Toolchain developer")) {
                await interaction.reply("Not available yet");
                return;
            }
        }

        await interaction.deferReply();

        const target = interaction.options.getString('target') ?? 'ez80';
        const optLevel = interaction.options.getString('opt') ?? 'z';
        const lang = interaction.options.getString('lang') ?? 'c -std=gnu11';

        let code = interaction.options.getString('code').replace(/"/g, '\\"');

        if (code.includes('#')) {
            await interaction.reply("Not accepted");
            return;
        }

        const tmpFile = makeTmpFile();
        if (!tmpFile) {
            await interaction.reply("Error creating tmpFile");
            return;
        }

        const origCode = code;
        code = `#include <stdint.h>
#include <tice.h>
typedef uint8_t u8;
typedef int8_t i8;
typedef uint16_t u16;
typedef int16_t i16;
typedef uint24_t u24;
typedef int24_t i24;
typedef uint32_t u32;
typedef int32_t i32;
typedef uint48_t u48;
typedef int48_t i48;
typedef uint64_t u64;
typedef int64_t i64;
` + code;
        fs.writeFileSync(tmpFile, code);

        let asmOutput = "";
        const cmd = `/home/pbbot/debchroot/opt/llvm-project/build/bin/clang -target ${target} -nostdinc -isystem /home/pbbot/debchroot/opt/CEdev/include -fno-threadsafe-statics -Xclang -fforce-mangle-main-argc-argv -w -S -O${optLevel} -x${lang} ${tmpFile} -o -`;
        exec(cmd, (err, stdout, stderr) => {
            //if (stdout.length) console.log('[clangBot] stdout is:' + stdout);
            if (stderr.length) console.log('[clangBot] stderr is:' + stderr);

            if (err) console.log('[clangBot] error is:' + err);
            else asmOutput = stdout;

            asmOutput = asmOutput.replaceAll(`\tsection\t.text,"ax",@progbits\n`, '')
                .replaceAll(`\tsection\t.data,"aw",@progbits\n`, '')
                .replaceAll(`\tassume\tadl = 1\n`, '')
                .replaceAll(`\tident\t"clang version 15.0.0 (https://github.com/jacobly0/llvm-project.git 005a99ce2569373524bd881207aa4a1e98a2b238)"\n`, '')
                .replaceAll(`\textern\t__Unwind_SjLj_Register
\textern\t__Unwind_SjLj_Unregister\n`, '');
            fs.unlinkSync(tmpFile);
            if (asmOutput.length) {
                interaction.editReply(`Compiling ${lang} in \`-O${optLevel}\` for ${target}: \`\`\`cpp\n${origCode}\`\`\`\n\`\`\`avrasm\n${asmOutput.trim()}\`\`\``);
            } else {
                interaction.editReply(`Error compiling the code: \`${origCode}\``);
            }
        });
    },
};