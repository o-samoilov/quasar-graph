import { join } from 'node:path';
import { homedir } from 'node:os';

export function quasarDir(home = homedir()) {
  return join(home, '.quasar-graph');
}
