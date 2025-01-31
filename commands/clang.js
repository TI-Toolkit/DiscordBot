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
            if ((interaction.guildId !== '432891584451706892')
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
        if (target === 'ez80') {
            code = `#include <stdint.h>
#include <tice.h>
typedef uint8_t u8;
typedef int8_t i8;
typedef int8_t s8;
typedef uint16_t u16;
typedef int16_t i16;
typedef int16_t s16;
typedef uint24_t u24;
typedef int24_t i24;
typedef int24_t s24;
typedef uint32_t u32;
typedef int32_t i32;
typedef int32_t s32;
typedef uint48_t u48;
typedef int48_t i48;
typedef int48_t s48;
typedef uint64_t u64;
typedef int64_t i64;
typedef int64_t s64;
` + code;
        }
        fs.writeFileSync(tmpFile, code);

        let asmOutput = "";
        const cmd = `/home/pbbot/debchroot/opt/CEdev/bin/test/ez80-clang -target ${target} -nostdinc -isystem /home/pbbot/debchroot/opt/CEdev/include -fno-threadsafe-statics -Xclang -fforce-mangle-main-argc-argv -w -S -O${optLevel} -x${lang} ${tmpFile} -o -`;
        exec(cmd, async (err, stdout, stderr) => {
            //if (stdout.length) console.log('[clangBot] stdout is:' + stdout);
            if (stderr.length) console.log('[clangBot] stderr is:' + stderr);

            if (err) console.log('[clangBot] error is:' + err);
            else asmOutput = stdout;

            asmOutput = asmOutput.replaceAll(`\tsection\t.text,"ax",@progbits\n`, '')
                .replaceAll(`\tsection\t.data,"aw",@progbits\n`, '')
                .replaceAll(`\tassume\tadl = 1\n`, '')
                .replaceAll(`\tident\t"clang version 15.0.0 (https://github.com/CE-Programming/llvm-project 9257fd038e0730d7b13ae4ee677745670f077817)"\n`, '')
                .replaceAll(`\textern\t__Unwind_SjLj_Register
\textern\t__Unwind_SjLj_Unregister\n`, '');
            fs.unlinkSync(tmpFile);
            try {
                if (asmOutput.length) {
                    const msgWithoutAsm = `Compiling ${lang} in \`-O${optLevel}\` for ${target}: \`\`\`cpp\n${origCode}\`\`\``;
                    const asmStr = asmOutput.trim().substring(0, 1830) + " [...] ";
                    await interaction.editReply(`${msgWithoutAsm}\n\`\`\`avrasm\n${asmStr}\`\`\``);
                } else {
                    await interaction.editReply(`Error compiling the code: \`${origCode}\``);
                }
            } catch (e) {
                await interaction.editReply(`Error ...`);
            }
        });
    },
};