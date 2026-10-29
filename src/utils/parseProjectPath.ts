import { toPortablePath } from '@ankhorage/utility/node/path';

/*** Returns the configured project path in portable POSIX form. */
export const parseProjectPath = (projectPath = process.env.ATLAS_PROJECT_PATH) => {
  if (!projectPath) throw new Error('Missing ENV: ATLAS_PROJECT_PATH');

  return toPortablePath(projectPath);
};
