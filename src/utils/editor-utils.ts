import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';

export const resolveLanguage = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase();
  
  // Scripting & Shell
  if (extension === 'sh' || extension === 'bash') return StreamLanguage.define(shell);
  if (extension === 'ps1' || extension === 'psm1' || extension === 'psd1') return StreamLanguage.define(powerShell);
  if (extension === 'bat' || extension === 'cmd' || extension === 'batch') return StreamLanguage.define(powerShell);
  
  // Configuration
  if (extension === 'env' || extension === 'ini' || extension === 'properties' || extension === 'config') {
    return StreamLanguage.define(properties);
  }
  
  // Core Languages
  if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(path)) return javascript({ jsx: true, typescript: true });
  if (/\.css$/.test(path)) return css();
  if (/\.(html|htm)$/.test(path)) return html();
  if (/\.json$/.test(path)) return json();
  if (/\.(md|mdx)$/.test(path)) return markdown();
  if (/\.py$/.test(path)) return python();
  if (/\.sql$/.test(path)) return sql();
  if (/\.(xml|svg)$/.test(path)) return xml();
  if (/\.(yaml|yml)$/.test(path)) return yaml();
  
  return [];
};
