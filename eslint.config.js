// ESLint flat config（負債D5）。strict TS が最後の砦だったところに最小の静的チェックを足す。
// 方針＝最小ルール（未使用/no-explicit-any は警告どまり）。CI は無いので `pnpm lint` を習慣に。
// 既存コードの手動0にはこだわらない＝赤(error)は本物のバグ相当に絞り、様式は warn。
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // 生成物・外部・ドッグフードツール・E2E・Python は対象外。
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.config.js",
      "**/*.config.ts",
      "_dogfood_ui/**",
      "apps/audio/**",
      "apps/worker/**",
      "apps/web/playwright*/**",
      "apps/web/e2e/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // 最小運用：本物のバグに近いものだけ error、様式・型ゆるみは warn（手動0にこだわらない）。
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // 短絡評価・三項・カンマ演算子での副作用（`cond && fn()` / `(a.push(x), (p.y=z))`）は
      // 本コードが意図的に多用する簡潔イディオム＝様式なので warn どまり（手動0にこだわらない）。
      "@typescript-eslint/no-unused-expressions": [
        "warn",
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true },
      ],
      "no-useless-escape": "warn", // 正規表現の余分なエスケープは様式＝警告（挙動は変わらない）
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // strict TS が担保する領域と二重で騒がないよう、型なし解析で誤検知しがちなものは緩める。
      "no-undef": "off", // TS が未定義参照を型で捕まえる（flat config で env 全指定は冗長）
    },
  },
  {
    // web は React＝hooks の規則を効かせる（既存の disable ディレクティブもこれで解決）。
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error", // フックの誤用は本物のバグ＝error
      "react-hooks/exhaustive-deps": "warn", // 依存配列は警告（意図的な省略は inline disable 済み）
    },
  },
  {
    // #27 再生経路の一本化 S5：playNotes（音源エンジン）を直接呼んでよいのは駆動層 playback.ts のみ。
    // UI/エディタ/フックは解決層 buildPlayback（music.ts）→駆動層 startPlayback（playback.ts）を通す＝
    // 仮歌/feel/mute/compound の手組み欠落を構造的に起こさせない（唯一のチョークポイント）。テストは対象外。
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/playback.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/audio", "**/music"],
              importNames: ["playNotes"],
              message: "playNotes は駆動層 playback.ts からのみ呼ぶ（#27）。UI/エディタは startPlayback（playback.ts）を使う。",
            },
          ],
        },
      ],
    },
  },
  {
    // テストは any/実験が多い＝さらに緩める（警告ノイズを減らす）。
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
