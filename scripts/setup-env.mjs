import { copyFile, constants } from 'node:fs/promises';
for (const folder of ['apps/web', 'apps/api']) {
  try {
    await copyFile(
      new URL('../' + folder + '/.env.example', import.meta.url),
      new URL('../' + folder + '/.env', import.meta.url),
      constants.COPYFILE_EXCL,
    );
    console.log('Created ' + folder + '/.env');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log('Kept existing ' + folder + '/.env');
  }
}
