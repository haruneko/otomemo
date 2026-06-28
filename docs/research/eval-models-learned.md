# 学習モデルによるメロ自然さ評価（CLaMP2-FMD / MuPT-perplexity）

ユーザー要望「耳・単一LLM・単一統計でなく、**大量の音楽で学習したモデル**で“自然さ”を測り、**どこが弱いか**を知りたい（コーパスバイアスの学習でなく改善の方向）」。最終更新 2026-06-28。

## 環境（`~/melody-eval/`・scratchpad消失対策で永続化）
`uv venv` + torch CPU + `frechet-music-distance`(=CLaMP2) + `transformers` + `m-a-p/MuPT-v0-8192-190M`。
- ★**`scipy<1.14` 必須**：新版は `scipy.linalg.sqrtm` の `disp` 引数を削除＝FMDが `TypeError` で落ちる。`uv pip install 'scipy<1.14'`。
- FrechetMusicDistance API：`FrechetMusicDistance(feature_extractor='clamp2').score(ref_dir, test_dir)`（dir=MIDI群）。`score_individual` で per-file。
- MuPT：`AutoModelForCausalLM/AutoTokenizer.from_pretrained(..., trust_remote_code=True)`。perplexity=`exp(model(ids,labels=ids).loss)`。入力はSMT-ABC（`%%score 1`/`Q:`/`V:1 treble`/`[V:1]`接頭）。

## ① CLaMP2-FMD（分布距離）＝制御メロには不向き
- 床(実vs実)=**92** / V2 vs 実曲=**201**（旧エンジン~156より遠い）。
- ＝**FMDは「綺麗に構造化されたメロ」を“生の実曲分布から離れてる”と罰する＝⊥耳**（セッション既知の再確認）。発展・後処理・弧で構造化したV2は分布的には実曲離れだが耳は良い。**制御メロの良し悪し判定には使えない**。

## ② MuPT perplexity（メロLMの自己回帰的自然さ）＝有効・耳と一致 ★
- **サニティ**：実曲(828)<シャッフル(1094)＝**運びの自然さを区別できる**。※手書き合成例(good/bad)は形式ノイズで逆転＝**実曲 vs その音シャッフルが正準サニティ**。
- ★**V2 vs 実曲：平均 2039 vs 2079・中央 2000 vs 1998 ＝ほぼ同一**（n=30ずつ・C移調・同一ABC変換）。＝**学習モデルがV2を“実曲並みに自然”と判定**。FMDと逆に**耳・E-ruleと一致＝独立した第3レンズが揃った**。
- **per-position（改善の方向）**：前半(A A')=3344 / 後半(B反行+弧 A'')=**3566**＝**発展部(特にB反行)がやや不自然**＝次の改善対象。

## 学び
- **分布距離(FMD) ⊥ 質／自己回帰 perplexity ≈ 質**。綺麗な制御メロは分布から離れるが「運び」は自然＝perplexityが正しく捉える。**“自然さ”は分布一致でなく系列予測で測れ**。
- 絶対perplexityは高い(~2000＝SMT-ABCのOOD/移調ノイズ)が、**同一変換での相対比較は妥当**。
- 3レンズの役割分担：**耳=最終／E-rule項目別=どの規則が弱いか／MuPT perplexity=運びが実曲並みか＋どの部分が弱いか**。FMDは退役（制御メロに不向き）。
- **次の改善**：B(反行)発展部の運びの自然さ＝perplexityで検証しながら詰められる。
