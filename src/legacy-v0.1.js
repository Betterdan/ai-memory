import { createHash } from 'node:crypto';

const BASELINE_HASHES = {
  '.ai/README.md': '5398a845005031d7905faeae29b2891af94eaaf7104b415e5fed3657fc42ee2f',
  'CLAUDE.md': '1ab2be083986c96f13ff126daf8f0d77ceff9918e695996e10706c1f1770d866',
  'AGENTS.md': 'b8f49a179b35f2c111450d24a840fc964cc3049dc3cc0b87c8193e1940fb7a42',
  '.claude/agents/critic.md': 'e3686c1735337b06fc3679de7302b477b1cff851f162d72a5ee855d86e7e8501',
  '.claude/commands/critic.md': 'cca4f2f98542c340fd169c55ac60c77a8cade348059d5f21374dfa0589225ff4',
  '.claude/commands/finalize-requirement.md': '3e0613d64d9f9e91d6f801fab77eec016cd874f3ca3ccd63118e24dd281a4158',
  '.claude/commands/new-requirement.md': 'f6409b11e74f0d134c8856e87e39d0bc5dc3760269e9be0bf954668ce7e1f0c3',
  '.claude/commands/update-memory.md': '9fa499b665763a9d25e09a7aa20b4dca22216f5ef32f411c643ccc5c096b7617',
  '.claude/settings.json': '7a800ca223aef127d4872baa481e7d75a8adc3c278e59d1e8383b58bfe9f8a29',
  '.claude/skills/critic/SKILL.md': '2d1537599c3f01dd03103fb1ad6777a439179561c0d054d17d120542b458faeb',
  '.claude/skills/memory-update/SKILL.md': 'c63cb7c3ff2b6e20f61619703112e3f0a75c22e9d37deabb38e40655c15f66d7',
  '.claude/skills/requirements-flow/SKILL.md': '41bcad8765c3f1d44821a4fecc6322b0534a166ef1362161300e434bbe9593c1',
  '.agents/skills/critic/SKILL.md': 'c9cb6471ab6c45360177a18b1ed7a900d943b16ae0e19045374e2767655c5da8',
  '.agents/skills/memory-update/SKILL.md': 'c63cb7c3ff2b6e20f61619703112e3f0a75c22e9d37deabb38e40655c15f66d7',
  '.agents/skills/requirements-flow/SKILL.md': '3417925a8fff47e7990739c04eab7a9a4a598372c73ff3be6b8b9683871a6dd7',
  '.ai/skills/architecture.md': 'd67e2275b8bc2797a5644d2eacbc0e4d23e04cf3e980e41f2081f556f0e243a8',
  '.ai/skills/code-review.md': 'c241b82763e8ee5948bac6ce2a00437347b95b18e5cad09d07669c75881cc1d9',
  '.ai/skills/critic.md': '24efea9e792435fbc1f3ff7204f153f33dd8c27bded656b2877ca6c84ef53d05',
  '.ai/skills/memory-update.md': '5d5e61cae831a5d74744f579fc6f550abfd42a3ef287bf791b4c9e2a235638e8',
  '.ai/skills/requirements-flow.md': 'b95f2649002cd028fc72122d243e39c16365aa1ed9b38d390522db7542b75f21',
  'docs/requirements/README.md': '968085f9824686deb3282ab7e82970899a73a06e8ccb31c55e6aadd8e87d91ec',
};

const VARIABLE_KEYS = {
  '.ai/README.md': ['projectName', 'date'],
  'CLAUDE.md': ['projectName', 'techStack'],
  'AGENTS.md': ['projectName', 'techStack'],
};

export function matchesLegacyV01Baseline(dest, content, vars) {
  const baseline = BASELINE_HASHES[dest];
  if (!baseline) return false;
  let normalized = content;
  for (const key of VARIABLE_KEYS[dest] ?? []) {
    const value = String(vars[key] ?? '');
    if (!value) return false;
    normalized = normalized.replaceAll(value, `{{${key}}}`);
  }
  return createHash('sha256').update(normalized).digest('hex') === baseline;
}
