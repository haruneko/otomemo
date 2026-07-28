/* data.js — v7 全表示データの単一定義（自動生成。手で編集しない＝ bake.mjs を変えて再実行）。
 *
 * 構造:
 *   V7DATA.songs.{A,B,C,D} … 曲。A=長い斑の主サンプル・B=メロだけ・C=詞だけ・D=断片だけ。
 *   song.sections[] … {id,name,bars:[始,終]|null,barsText?,kari?,noSing?,sameMelodyAs?,units[]}
 *     小節番号は前奏を勘定に入れて 1 から通す。仮セクションは bars を持たず barsText。
 *   units[] … kind:"phrase"（句）| "zone"（まだ何も無い区間）。
 *   句 … {id,bars,words|null,notes|{ref:句id}|null,band?,noLyric?,plan?,imi?,sameAs?,accent?}
 *     words: 表示語の区切り（通し表示は「　」結合で導出）。notes: {x,w,y}（x,w=0..256グリッド・
 *     y=相対音高で上が小さい）。モーラ i ↔ 音符 i の恒等対応。モーラ数<音符数の余りが空きの枠、
 *     モーラ数>音符数の余りがメロ未定の文字。{ref:} は同じメロの借用（二重記述禁止）。
 *   accent … {src,moras,hl,ap,phrases,tool} = accent.py（pyopenjtalk）の焼き込み。
 *     hl: 0=低/1=高。ap: モーラごとのアクセント句id。記憶で書いた高低は存在しない。
 *   lyrCands / melCands … 候補。{id,target=句id,...}。バッジ・印は表示時に marks.js が機械生成。
 *   refs … 枚が参照する実在の例（孤立の対象など）。
 *   opsTableText … 通しの面の操作の割当（枚1注記と遷移図はこの文字列をそのまま使う）。
 *   索引: phraseById / sectionById / planById / candById（読み込み時に参照検証つきで構築）。
 */
(function (g) {
"use strict";
var V7DATA = {
 "meta": {
  "generatedBy": "bake.mjs",
  "generatedAt": "2026-07-28T04:58:21.214Z",
  "accentTool": "apps/audio/accent.py (pyopenjtalk)",
  "accentLog": "accent-log.json",
  "note": "このファイルは自動生成。手で編集せず bake.mjs を変えて再実行すること。"
 },
 "opsTableText": "①詞テキストをタップ＝その場にカーソル・直接編集。\n②空きの枠をタップ＝その場の小フォーム（打つ／候補を探す／編集画面で開く）。\n③音符矩形（メロの帯）をタップ＝その句を範囲の編集画面で開く（1手）。\n④長押し（どこでも）＝範囲選択開始→端をのばす→「開く」で範囲の編集画面。\n⑤戻る＝通しの面の同じスクロール位置・同じ表示切替に戻る。",
 "songs": {
  "A": {
   "id": "A",
   "title": "サンプル曲（サンプルEP）",
   "sections": [
    {
     "id": "A-intro",
     "name": "前奏",
     "bars": [
      1,
      4
     ],
     "noSing": true,
     "units": []
    },
    {
     "id": "A-1A",
     "name": "1番Aメロ",
     "bars": [
      5,
      12
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "A-1A-k1",
       "bars": [
        5,
        6
       ],
       "words": [
        "あさおきて",
        "まどをあける"
       ],
       "notes": [
        {
         "x": 0,
         "w": 14,
         "y": 8
        },
        {
         "x": 16,
         "w": 14,
         "y": 12
        },
        {
         "x": 32,
         "w": 14,
         "y": 13
        },
        {
         "x": 48,
         "w": 14,
         "y": 9
        },
        {
         "x": 64,
         "w": 30,
         "y": 13
        },
        {
         "x": 144,
         "w": 14,
         "y": 9
        },
        {
         "x": 160,
         "w": 14,
         "y": 13
        },
        {
         "x": 176,
         "w": 14,
         "y": 14
        },
        {
         "x": 192,
         "w": 14,
         "y": 14
        },
        {
         "x": 208,
         "w": 20,
         "y": 10
        },
        {
         "x": 232,
         "w": 22,
         "y": 11
        }
       ],
       "feed": "朝起きて　窓を開ける",
       "accent": {
        "src": "朝起きて　窓を開ける",
        "moras": [
         "あ",
         "さ",
         "お",
         "き",
         "て",
         "ま",
         "ど",
         "を",
         "あ",
         "け",
         "る"
        ],
        "hl": [
         1,
         0,
         0,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1
        ],
        "ap": [
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 2,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 3
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-1A-k2",
       "bars": [
        7,
        8
       ],
       "words": [
        "みずをのんでから"
       ],
       "notes": [
        {
         "x": 0,
         "w": 14,
         "y": 14
        },
        {
         "x": 16,
         "w": 14,
         "y": 10
        },
        {
         "x": 32,
         "w": 14,
         "y": 12
        },
        {
         "x": 48,
         "w": 14,
         "y": 7
        },
        {
         "x": 64,
         "w": 14,
         "y": 9
        },
        {
         "x": 80,
         "w": 14,
         "y": 5
        },
        {
         "x": 96,
         "w": 14,
         "y": 8
        },
        {
         "x": 112,
         "w": 14,
         "y": 11
        },
        {
         "x": 128,
         "w": 30,
         "y": 8
        },
        {
         "x": 160,
         "w": 30,
         "y": 11
        },
        {
         "x": 192,
         "w": 62,
         "y": 14
        }
       ],
       "feed": "水を飲んでから",
       "imi": "でかける前のようす。急がない感じ",
       "accent": {
        "src": "水を飲んでから",
        "moras": [
         "み",
         "ず",
         "を",
         "の",
         "ん",
         "で",
         "か",
         "ら"
        ],
        "hl": [
         0,
         1,
         1,
         1,
         0,
         0,
         0,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         1
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 3
         },
         {
          "moras": 5,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-1A-k3",
       "bars": [
        9,
        10
       ],
       "words": [
        "かぎをかけて",
        "そとにでる"
       ],
       "notes": [
        {
         "x": 0,
         "w": 14,
         "y": 13
        },
        {
         "x": 16,
         "w": 14,
         "y": 9
        },
        {
         "x": 32,
         "w": 14,
         "y": 11
        },
        {
         "x": 48,
         "w": 14,
         "y": 12
        },
        {
         "x": 64,
         "w": 30,
         "y": 8
        },
        {
         "x": 96,
         "w": 34,
         "y": 11
        }
       ],
       "feed": "鍵をかけて　外に出る",
       "band": [
        [
         0,
         132
        ]
       ],
       "accent": {
        "src": "鍵をかけて　外に出る",
        "moras": [
         "か",
         "ぎ",
         "を",
         "か",
         "け",
         "て",
         "そ",
         "と",
         "に",
         "で",
         "る"
        ],
        "hl": [
         0,
         1,
         0,
         0,
         1,
         0,
         1,
         0,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 2,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-1A-k4",
       "bars": [
        11,
        12
       ],
       "words": [
        "バスをまって"
       ],
       "notes": [
        {
         "x": 0,
         "w": 14,
         "y": 14
        },
        {
         "x": 16,
         "w": 14,
         "y": 10
        },
        {
         "x": 32,
         "w": 14,
         "y": 7
        },
        {
         "x": 48,
         "w": 14,
         "y": 10
        },
        {
         "x": 64,
         "w": 14,
         "y": 8
        },
        {
         "x": 80,
         "w": 38,
         "y": 12
        }
       ],
       "feed": "バスを待って",
       "band": [
        [
         0,
         120
        ]
       ],
       "plan": {
        "id": "A-1A-k4-p1",
        "memo": "あと5音くらい"
       },
       "accent": {
        "src": "バスを待って",
        "moras": [
         "バ",
         "ス",
         "を",
         "ま",
         "っ",
         "て"
        ],
        "hl": [
         1,
         0,
         0,
         1,
         0,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      }
     ]
    },
    {
     "id": "A-1B",
     "name": "1番Bメロ",
     "bars": [
      13,
      20
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "A-1B-k1",
       "bars": [
        13,
        14
       ],
       "words": [
        "ふくをたたんで",
        "たなにいれる"
       ],
       "notes": [
        {
         "x": 0,
         "w": 14,
         "y": 16
        },
        {
         "x": 16,
         "w": 14,
         "y": 12
        },
        {
         "x": 32,
         "w": 14,
         "y": 9
        },
        {
         "x": 48,
         "w": 14,
         "y": 11
        },
        {
         "x": 64,
         "w": 14,
         "y": 7
        },
        {
         "x": 80,
         "w": 14,
         "y": 5
        },
        {
         "x": 96,
         "w": 14,
         "y": 8
        },
        {
         "x": 112,
         "w": 14,
         "y": 6
        },
        {
         "x": 128,
         "w": 14,
         "y": 10
        },
        {
         "x": 144,
         "w": 14,
         "y": 13
        },
        {
         "x": 160,
         "w": 30,
         "y": 11
        },
        {
         "x": 192,
         "w": 30,
         "y": 9
        },
        {
         "x": 224,
         "w": 30,
         "y": 12
        }
       ],
       "feed": "服をたたんで　棚に入れる",
       "accent": {
        "src": "服をたたんで　棚に入れる",
        "moras": [
         "ふ",
         "く",
         "を",
         "た",
         "た",
         "ん",
         "で",
         "た",
         "な",
         "に",
         "い",
         "れ",
         "る"
        ],
        "hl": [
         0,
         1,
         0,
         0,
         1,
         1,
         1,
         0,
         1,
         1,
         0,
         1,
         1
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 4,
          "kernel": 4
         },
         {
          "moras": 3,
          "kernel": 3
         },
         {
          "moras": 3,
          "kernel": 3
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-1B-k2",
       "bars": [
        15,
        16
       ],
       "words": null,
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 13
        },
        {
         "x": 32,
         "w": 30,
         "y": 9
        },
        {
         "x": 64,
         "w": 30,
         "y": 11
        },
        {
         "x": 96,
         "w": 30,
         "y": 6
        },
        {
         "x": 128,
         "w": 30,
         "y": 8
        },
        {
         "x": 160,
         "w": 30,
         "y": 5
        },
        {
         "x": 192,
         "w": 30,
         "y": 9
        },
        {
         "x": 224,
         "w": 30,
         "y": 12
        }
       ]
      },
      {
       "kind": "zone",
       "id": "A-1B-z1",
       "bars": [
        17,
        20
       ]
      }
     ]
    },
    {
     "id": "A-1S",
     "name": "1番サビ",
     "bars": [
      21,
      28
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "A-1S-k1",
       "bars": [
        21,
        22
       ],
       "words": [
        "きょうのよていを",
        "かみにかく"
       ],
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 12
        },
        {
         "x": 32,
         "w": 14,
         "y": 15
        },
        {
         "x": 48,
         "w": 14,
         "y": 15
        },
        {
         "x": 64,
         "w": 14,
         "y": 13
        },
        {
         "x": 80,
         "w": 14,
         "y": 9
        },
        {
         "x": 96,
         "w": 14,
         "y": 9
        },
        {
         "x": 112,
         "w": 14,
         "y": 11
        },
        {
         "x": 128,
         "w": 14,
         "y": 11
        },
        {
         "x": 144,
         "w": 14,
         "y": 7
        },
        {
         "x": 160,
         "w": 30,
         "y": 10
        },
        {
         "x": 192,
         "w": 30,
         "y": 5
        },
        {
         "x": 224,
         "w": 30,
         "y": 9
        }
       ],
       "feed": "今日の予定を　紙に書く",
       "accent": {
        "src": "今日の予定を　紙に書く",
        "moras": [
         "きょ",
         "う",
         "の",
         "よ",
         "て",
         "い",
         "を",
         "か",
         "み",
         "に",
         "か",
         "く"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         0,
         1,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 4,
          "kernel": 4
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 2,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-1S-k2",
       "bars": [
        23,
        24
       ],
       "words": [
        "まどのそと",
        "みちがみえる"
       ],
       "notes": null,
       "feed": "窓の外　道が見える",
       "accent": {
        "src": "窓の外　道が見える",
        "moras": [
         "ま",
         "ど",
         "の",
         "そ",
         "と",
         "み",
         "ち",
         "が",
         "み",
         "え",
         "る"
        ],
        "hl": [
         1,
         0,
         0,
         1,
         0,
         0,
         1,
         1,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         2,
         2,
         2,
         3,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 2,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 3
         },
         {
          "moras": 3,
          "kernel": 2
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-1S-k3",
       "bars": [
        25,
        26
       ],
       "words": null,
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 12
        },
        {
         "x": 32,
         "w": 30,
         "y": 8
        },
        {
         "x": 64,
         "w": 30,
         "y": 10
        },
        {
         "x": 96,
         "w": 30,
         "y": 5
        },
        {
         "x": 128,
         "w": 30,
         "y": 7
        },
        {
         "x": 160,
         "w": 30,
         "y": 4
        },
        {
         "x": 192,
         "w": 30,
         "y": 8
        },
        {
         "x": 224,
         "w": 30,
         "y": 11
        }
       ],
       "noLyric": true
      },
      {
       "kind": "phrase",
       "id": "A-1S-k4",
       "bars": [
        27,
        28
       ],
       "words": null,
       "notes": null,
       "plan": {
        "id": "A-1S-k4-p1",
        "memo": "しめの一言",
        "onsu": "8音くらい"
       }
      }
     ]
    },
    {
     "id": "A-2A",
     "name": "2番Aメロ",
     "bars": [
      29,
      36
     ],
     "sameMelodyAs": "A-1A",
     "units": [
      {
       "kind": "phrase",
       "id": "A-2A-k1",
       "bars": [
        29,
        30
       ],
       "words": [
        "よるがきて",
        "まどをしめる"
       ],
       "notes": {
        "ref": "A-1A-k1"
       },
       "feed": "夜が来て　窓を閉める",
       "sameAs": "A-1A-k1",
       "accent": {
        "src": "夜が来て　窓を閉める",
        "moras": [
         "よ",
         "る",
         "が",
         "き",
         "て",
         "ま",
         "ど",
         "を",
         "し",
         "め",
         "る"
        ],
        "hl": [
         1,
         0,
         0,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         2,
         2,
         2,
         3,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 2,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 2
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-2A-k2",
       "bars": [
        31,
        32
       ],
       "words": null,
       "notes": {
        "ref": "A-1A-k2"
       },
       "sameAs": "A-1A-k2"
      },
      {
       "kind": "phrase",
       "id": "A-2A-k3",
       "bars": [
        33,
        34
       ],
       "words": null,
       "notes": {
        "ref": "A-1A-k3"
       },
       "sameAs": "A-1A-k3"
      },
      {
       "kind": "phrase",
       "id": "A-2A-k4",
       "bars": [
        35,
        36
       ],
       "words": null,
       "notes": {
        "ref": "A-1A-k4"
       },
       "sameAs": "A-1A-k4"
      }
     ]
    },
    {
     "id": "A-2B",
     "name": "2番Bメロ",
     "bars": [
      37,
      44
     ],
     "sameMelodyAs": "A-1B",
     "units": [
      {
       "kind": "phrase",
       "id": "A-2B-k1",
       "bars": [
        37,
        38
       ],
       "words": null,
       "notes": {
        "ref": "A-1B-k1"
       },
       "sameAs": "A-1B-k1"
      },
      {
       "kind": "phrase",
       "id": "A-2B-k2",
       "bars": [
        39,
        40
       ],
       "words": null,
       "notes": {
        "ref": "A-1B-k2"
       },
       "sameAs": "A-1B-k2"
      },
      {
       "kind": "zone",
       "id": "A-2B-z1",
       "bars": [
        41,
        44
       ]
      }
     ]
    },
    {
     "id": "A-2S",
     "name": "2番サビ",
     "bars": [
      45,
      52
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "A-2S-k1",
       "bars": [
        45,
        46
       ],
       "words": [
        "でんきをけして",
        "へやをでる"
       ],
       "notes": null,
       "feed": "電気を消して　部屋を出る",
       "accent": {
        "src": "電気を消して　部屋を出る",
        "moras": [
         "で",
         "ん",
         "き",
         "を",
         "け",
         "し",
         "て",
         "へ",
         "や",
         "を",
         "で",
         "る"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         0,
         1,
         1,
         0,
         1,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 4,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 3
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 2,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-2S-k2",
       "bars": [
        47,
        48
       ],
       "words": [
        "かさをもって"
       ],
       "notes": null,
       "feed": "傘を持って",
       "plan": {
        "id": "A-2S-k2-p1",
        "memo": "あと6音くらい"
       },
       "accent": {
        "src": "傘を持って",
        "moras": [
         "か",
         "さ",
         "を",
         "も",
         "っ",
         "て"
        ],
        "hl": [
         1,
         0,
         0,
         1,
         0,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-2S-k3",
       "bars": [
        49,
        52
       ],
       "words": [
        "ドアをしめて",
        "かぎをかける"
       ],
       "notes": null,
       "feed": "ドアを閉めて　鍵をかける",
       "accent": {
        "src": "ドアを閉めて　鍵をかける",
        "moras": [
         "ド",
         "ア",
         "を",
         "し",
         "め",
         "て",
         "か",
         "ぎ",
         "を",
         "か",
         "け",
         "る"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         1,
         0,
         0,
         1,
         0,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 3,
          "kernel": 2
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      }
     ]
    },
    {
     "id": "A-C",
     "name": "Cメロ",
     "bars": [
      53,
      60
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "A-C-k1",
       "bars": [
        53,
        54
       ],
       "words": [
        "テレビをけして",
        "おちゃをのむ"
       ],
       "notes": null,
       "feed": "テレビを消して　お茶を飲む",
       "accent": {
        "src": "テレビを消して　お茶を飲む",
        "moras": [
         "テ",
         "レ",
         "ビ",
         "を",
         "け",
         "し",
         "て",
         "お",
         "ちゃ",
         "を",
         "の",
         "む"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         0,
         1,
         1,
         0,
         1,
         1,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 4,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 3
         },
         {
          "moras": 3,
          "kernel": 3
         },
         {
          "moras": 2,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-C-k2",
       "bars": [
        55,
        56
       ],
       "words": [
        "ざっしをとじて",
        "めをとじる"
       ],
       "notes": null,
       "feed": "雑誌を閉じて　目を閉じる",
       "imi": "ひと息ついて休む場面",
       "accent": {
        "src": "雑誌を閉じて　目を閉じる",
        "moras": [
         "ざ",
         "っ",
         "し",
         "を",
         "と",
         "じ",
         "て",
         "め",
         "を",
         "と",
         "じ",
         "る"
        ],
        "hl": [
         0,
         1,
         1,
         1,
         0,
         1,
         0,
         1,
         0,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         3,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 4,
          "kernel": 4
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 2,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 2
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-C-k3",
       "bars": [
        57,
        60
       ],
       "words": [
        "とけいのはりを",
        "ながめてる"
       ],
       "notes": null,
       "feed": "時計の針を　眺めてる",
       "accent": {
        "src": "時計の針を　眺めてる",
        "moras": [
         "と",
         "け",
         "い",
         "の",
         "は",
         "り",
         "を",
         "な",
         "が",
         "め",
         "て",
         "る"
        ],
        "hl": [
         0,
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2,
         2,
         2
        ],
        "phrases": [
         {
          "moras": 4,
          "kernel": 4
         },
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 5,
          "kernel": 4
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      }
     ]
    },
    {
     "id": "A-D",
     "name": "Dメロ",
     "bars": [
      61,
      72
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "A-D-k1",
       "bars": [
        61,
        62
       ],
       "words": [
        "くつをそろえて",
        "げんかんへ"
       ],
       "notes": [
        {
         "x": 0,
         "w": 14,
         "y": 14
        },
        {
         "x": 16,
         "w": 14,
         "y": 10
        },
        {
         "x": 32,
         "w": 14,
         "y": 12
        },
        {
         "x": 48,
         "w": 14,
         "y": 13
        },
        {
         "x": 64,
         "w": 14,
         "y": 9
        },
        {
         "x": 80,
         "w": 14,
         "y": 9
        },
        {
         "x": 96,
         "w": 14,
         "y": 12
        },
        {
         "x": 112,
         "w": 14,
         "y": 9
        },
        {
         "x": 128,
         "w": 30,
         "y": 13
        },
        {
         "x": 160,
         "w": 30,
         "y": 14
        },
        {
         "x": 192,
         "w": 30,
         "y": 14
        },
        {
         "x": 224,
         "w": 30,
         "y": 15
        }
       ],
       "feed": "靴をそろえて　玄関へ",
       "accent": {
        "src": "靴をそろえて　玄関へ",
        "moras": [
         "く",
         "つ",
         "を",
         "そ",
         "ろ",
         "え",
         "て",
         "げ",
         "ん",
         "か",
         "ん",
         "へ"
        ],
        "hl": [
         0,
         1,
         0,
         0,
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         2,
         2,
         2,
         2,
         2
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 4,
          "kernel": 3
         },
         {
          "moras": 5,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-D-k2",
       "bars": [
        63,
        64
       ],
       "words": [
        "ポストのてがみを",
        "とりにいく"
       ],
       "notes": [
        {
         "x": 0,
         "w": 14,
         "y": 10
        },
        {
         "x": 16,
         "w": 14,
         "y": 14
        },
        {
         "x": 32,
         "w": 14,
         "y": 14
        },
        {
         "x": 48,
         "w": 14,
         "y": 15
        },
        {
         "x": 64,
         "w": 14,
         "y": 14
        },
        {
         "x": 80,
         "w": 14,
         "y": 10
        },
        {
         "x": 96,
         "w": 14,
         "y": 10
        },
        {
         "x": 112,
         "w": 14,
         "y": 9
        },
        {
         "x": 128,
         "w": 14,
         "y": 13
        },
        {
         "x": 144,
         "w": 14,
         "y": 9
        },
        {
         "x": 160,
         "w": 30,
         "y": 12
        },
        {
         "x": 192,
         "w": 30,
         "y": 14
        },
        {
         "x": 224,
         "w": 30,
         "y": 10
        }
       ],
       "feed": "ポストの手紙を　取りに行く",
       "accent": {
        "src": "ポストの手紙を　取りに行く",
        "moras": [
         "ポ",
         "ス",
         "ト",
         "の",
         "て",
         "が",
         "み",
         "を",
         "と",
         "り",
         "に",
         "い",
         "く"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         0,
         1,
         0,
         0,
         1
        ],
        "ap": [
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         2,
         2,
         2,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 4,
          "kernel": 1
         },
         {
          "moras": 4,
          "kernel": 4
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 2,
          "kernel": 2
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-D-k3",
       "bars": [
        65,
        66
       ],
       "words": null,
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 15
        },
        {
         "x": 32,
         "w": 30,
         "y": 11
        },
        {
         "x": 64,
         "w": 30,
         "y": 8
        },
        {
         "x": 96,
         "w": 30,
         "y": 10
        },
        {
         "x": 128,
         "w": 30,
         "y": 6
        },
        {
         "x": 160,
         "w": 30,
         "y": 9
        },
        {
         "x": 192,
         "w": 30,
         "y": 7
        },
        {
         "x": 224,
         "w": 30,
         "y": 11
        }
       ]
      },
      {
       "kind": "phrase",
       "id": "A-D-k4",
       "bars": [
        67,
        68
       ],
       "words": null,
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 12
        },
        {
         "x": 32,
         "w": 30,
         "y": 8
        },
        {
         "x": 64,
         "w": 14,
         "y": 10
        },
        {
         "x": 80,
         "w": 14,
         "y": 5
        },
        {
         "x": 96,
         "w": 30,
         "y": 7
        },
        {
         "x": 128,
         "w": 30,
         "y": 4
        },
        {
         "x": 160,
         "w": 14,
         "y": 8
        },
        {
         "x": 176,
         "w": 30,
         "y": 11
        },
        {
         "x": 208,
         "w": 46,
         "y": 13
        }
       ]
      },
      {
       "kind": "phrase",
       "id": "A-D-k5",
       "bars": [
        69,
        70
       ],
       "words": [
        "シャツのボタンを",
        "とめなおす"
       ],
       "notes": null,
       "feed": "シャツのボタンを　留め直す",
       "accent": {
        "src": "シャツのボタンを　留め直す",
        "moras": [
         "シャ",
         "ツ",
         "の",
         "ボ",
         "タ",
         "ン",
         "を",
         "と",
         "め",
         "な",
         "お",
         "す"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         0,
         1,
         1,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         2,
         2,
         2,
         2,
         2
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 4,
          "kernel": 4
         },
         {
          "moras": 5,
          "kernel": 4
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "A-D-k6",
       "bars": [
        71,
        72
       ],
       "words": [
        "メモをたたんで",
        "ポケットへ"
       ],
       "notes": null,
       "feed": "メモをたたんで　ポケットへ",
       "accent": {
        "src": "メモをたたんで　ポケットへ",
        "moras": [
         "メ",
         "モ",
         "を",
         "た",
         "た",
         "ん",
         "で",
         "ポ",
         "ケ",
         "ッ",
         "ト",
         "へ"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         1,
         1,
         2,
         2,
         2,
         2,
         2
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 4,
          "kernel": 4
         },
         {
          "moras": 5,
          "kernel": 1
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      }
     ]
    },
    {
     "id": "A-kan2",
     "name": "間奏2",
     "bars": [
      73,
      76
     ],
     "noSing": true,
     "units": []
    },
    {
     "id": "A-oosabi",
     "name": "大サビ",
     "kari": true,
     "barsText": "8小節くらい",
     "units": [
      {
       "kind": "zone",
       "id": "A-oosabi-z1",
       "bars": null,
       "plan": {
        "id": "A-oosabi-p1",
        "memo": "しずかめに",
        "onsu": "8音×2くらい"
       }
      }
     ]
    },
    {
     "id": "A-outro",
     "name": "アウトロ",
     "kari": true,
     "barsText": "小節数未定",
     "units": [
      {
       "kind": "zone",
       "id": "A-outro-z1",
       "bars": null
      }
     ]
    }
   ],
   "stock": [
    {
     "id": "A-st1",
     "words": [
      "ゆうがたのみちをあるく"
     ],
     "feed": "夕方の道を歩く",
     "place": "未定",
     "w": 294,
     "notes": [
      {
       "x": 0,
       "w": 26,
       "y": 14
      },
      {
       "x": 28,
       "w": 26,
       "y": 10
      },
      {
       "x": 56,
       "w": 14,
       "y": 10
      },
      {
       "x": 72,
       "w": 14,
       "y": 9
      },
      {
       "x": 88,
       "w": 26,
       "y": 10
      },
      {
       "x": 116,
       "w": 26,
       "y": 13
      },
      {
       "x": 144,
       "w": 14,
       "y": 9
      },
      {
       "x": 160,
       "w": 26,
       "y": 9
      },
      {
       "x": 188,
       "w": 26,
       "y": 14
      },
      {
       "x": 216,
       "w": 26,
       "y": 10
      },
      {
       "x": 244,
       "w": 40,
       "y": 12
      }
     ],
     "accent": {
      "src": "夕方の道を歩く",
      "moras": [
       "ゆ",
       "う",
       "が",
       "た",
       "の",
       "み",
       "ち",
       "を",
       "あ",
       "る",
       "く"
      ],
      "hl": [
       0,
       1,
       1,
       1,
       1,
       0,
       1,
       1,
       0,
       1,
       0
      ],
      "ap": [
       0,
       0,
       0,
       0,
       0,
       1,
       1,
       1,
       2,
       2,
       2
      ],
      "phrases": [
       {
        "moras": 5,
        "kernel": 5
       },
       {
        "moras": 3,
        "kernel": 3
       },
       {
        "moras": 3,
        "kernel": 2
       }
      ],
      "tool": "apps/audio/accent.py (pyopenjtalk)"
     }
    }
   ]
  },
  "B": {
   "id": "B",
   "title": "サンプル曲B（サンプルEP）",
   "sections": [
    {
     "id": "B-A",
     "name": "Aメロ",
     "bars": [
      1,
      8
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "B-A-k1",
       "bars": [
        1,
        4
       ],
       "words": null,
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 15
        },
        {
         "x": 32,
         "w": 30,
         "y": 11
        },
        {
         "x": 64,
         "w": 14,
         "y": 8
        },
        {
         "x": 80,
         "w": 14,
         "y": 10
        },
        {
         "x": 96,
         "w": 30,
         "y": 6
        },
        {
         "x": 128,
         "w": 30,
         "y": 9
        },
        {
         "x": 160,
         "w": 14,
         "y": 7
        },
        {
         "x": 176,
         "w": 30,
         "y": 11
        },
        {
         "x": 208,
         "w": 46,
         "y": 14
        }
       ]
      },
      {
       "kind": "phrase",
       "id": "B-A-k2",
       "bars": [
        5,
        8
       ],
       "words": null,
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 14
        },
        {
         "x": 32,
         "w": 30,
         "y": 10
        },
        {
         "x": 64,
         "w": 30,
         "y": 12
        },
        {
         "x": 96,
         "w": 30,
         "y": 7
        },
        {
         "x": 128,
         "w": 30,
         "y": 9
        },
        {
         "x": 160,
         "w": 30,
         "y": 6
        },
        {
         "x": 192,
         "w": 30,
         "y": 10
        },
        {
         "x": 224,
         "w": 30,
         "y": 13
        }
       ]
      }
     ]
    },
    {
     "id": "B-S",
     "name": "サビ",
     "bars": [
      9,
      16
     ],
     "units": [
      {
       "kind": "phrase",
       "id": "B-S-k1",
       "bars": [
        9,
        16
       ],
       "words": null,
       "notes": [
        {
         "x": 0,
         "w": 30,
         "y": 16
        },
        {
         "x": 32,
         "w": 30,
         "y": 11
        },
        {
         "x": 64,
         "w": 30,
         "y": 7
        },
        {
         "x": 96,
         "w": 30,
         "y": 9
        },
        {
         "x": 128,
         "w": 30,
         "y": 5
        },
        {
         "x": 160,
         "w": 30,
         "y": 8
        },
        {
         "x": 192,
         "w": 30,
         "y": 6
        },
        {
         "x": 224,
         "w": 30,
         "y": 10
        }
       ]
      }
     ]
    }
   ],
   "stock": []
  },
  "C": {
   "id": "C",
   "title": "サンプル曲C（サンプルEP）",
   "sections": [
    {
     "id": "C-A",
     "name": "Aメロ",
     "bars": null,
     "barsText": "当てなし",
     "units": [
      {
       "kind": "phrase",
       "id": "C-A-k1",
       "bars": null,
       "words": [
        "あめのひは",
        "かさをさして"
       ],
       "notes": null,
       "feed": "雨の日は　傘をさして",
       "accent": {
        "src": "雨の日は　傘をさして",
        "moras": [
         "あ",
         "め",
         "の",
         "ひ",
         "は",
         "か",
         "さ",
         "を",
         "さ",
         "し",
         "て"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         1,
         1,
         0,
         0,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         1,
         1,
         2,
         2,
         2,
         3,
         3,
         3
        ],
        "phrases": [
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 2,
          "kernel": 2
         },
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 2
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "C-A-k2",
       "bars": null,
       "words": [
        "えきまでの",
        "みちをあるく"
       ],
       "notes": null,
       "feed": "駅までの　道を歩く",
       "accent": {
        "src": "駅までの　道を歩く",
        "moras": [
         "え",
         "き",
         "ま",
         "で",
         "の",
         "み",
         "ち",
         "を",
         "あ",
         "る",
         "く"
        ],
        "hl": [
         1,
         0,
         0,
         0,
         0,
         0,
         1,
         1,
         0,
         1,
         0
        ],
        "ap": [
         0,
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2
        ],
        "phrases": [
         {
          "moras": 5,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 3
         },
         {
          "moras": 3,
          "kernel": 2
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      }
     ]
    },
    {
     "id": "C-S",
     "name": "サビ",
     "bars": null,
     "barsText": "当てなし",
     "units": [
      {
       "kind": "phrase",
       "id": "C-S-k1",
       "bars": null,
       "words": [
        "しんごうが",
        "あおにかわる"
       ],
       "notes": null,
       "feed": "信号が　青に変わる",
       "accent": {
        "src": "信号が　青に変わる",
        "moras": [
         "し",
         "ん",
         "ご",
         "う",
         "が",
         "あ",
         "お",
         "に",
         "か",
         "わ",
         "る"
        ],
        "hl": [
         0,
         1,
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1
        ],
        "ap": [
         0,
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2
        ],
        "phrases": [
         {
          "moras": 5,
          "kernel": 5
         },
         {
          "moras": 3,
          "kernel": 1
         },
         {
          "moras": 3,
          "kernel": 3
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      },
      {
       "kind": "phrase",
       "id": "C-S-k2",
       "bars": null,
       "words": [
        "ふみきりの",
        "おとがきこえる"
       ],
       "notes": null,
       "feed": "踏切の　音が聞こえる",
       "accent": {
        "src": "踏切の　音が聞こえる",
        "moras": [
         "ふ",
         "み",
         "き",
         "り",
         "の",
         "お",
         "と",
         "が",
         "き",
         "こ",
         "え",
         "る"
        ],
        "hl": [
         0,
         1,
         1,
         1,
         1,
         0,
         1,
         0,
         0,
         1,
         1,
         1
        ],
        "ap": [
         0,
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         2,
         2,
         2,
         2
        ],
        "phrases": [
         {
          "moras": 5,
          "kernel": 5
         },
         {
          "moras": 3,
          "kernel": 2
         },
         {
          "moras": 4,
          "kernel": 4
         }
        ],
        "tool": "apps/audio/accent.py (pyopenjtalk)"
       }
      }
     ]
    }
   ],
   "stock": []
  },
  "D": {
   "id": "D",
   "title": "サンプル曲D（サンプルEP）",
   "sections": [],
   "stock": [
    {
     "id": "D-st1",
     "words": [
      "まちのあかりがともるころ"
     ],
     "feed": "街の明かりが灯る頃",
     "place": "未定",
     "w": 294,
     "notes": [
      {
       "x": 0,
       "w": 24,
       "y": 14
      },
      {
       "x": 26,
       "w": 24,
       "y": 10
      },
      {
       "x": 52,
       "w": 14,
       "y": 13
      },
      {
       "x": 68,
       "w": 24,
       "y": 14
      },
      {
       "x": 94,
       "w": 24,
       "y": 10
      },
      {
       "x": 120,
       "w": 14,
       "y": 10
      },
      {
       "x": 136,
       "w": 24,
       "y": 9
      },
      {
       "x": 162,
       "w": 24,
       "y": 13
      },
      {
       "x": 188,
       "w": 14,
       "y": 9
      },
      {
       "x": 204,
       "w": 24,
       "y": 12
      },
      {
       "x": 230,
       "w": 24,
       "y": 9
      },
      {
       "x": 256,
       "w": 28,
       "y": 13
      }
     ],
     "accent": {
      "src": "街の明かりが灯る頃",
      "moras": [
       "ま",
       "ち",
       "の",
       "あ",
       "か",
       "り",
       "が",
       "と",
       "も",
       "る",
       "こ",
       "ろ"
      ],
      "hl": [
       0,
       1,
       0,
       0,
       1,
       1,
       1,
       0,
       1,
       0,
       1,
       0
      ],
      "ap": [
       0,
       0,
       0,
       1,
       1,
       1,
       1,
       2,
       2,
       2,
       3,
       3
      ],
      "phrases": [
       {
        "moras": 3,
        "kernel": 2
       },
       {
        "moras": 4,
        "kernel": 4
       },
       {
        "moras": 3,
        "kernel": 2
       },
       {
        "moras": 2,
        "kernel": 1
       }
      ],
      "tool": "apps/audio/accent.py (pyopenjtalk)"
     }
    }
   ]
  }
 },
 "lyrCands": [
  {
   "id": "A-1A-k2-lc1",
   "word": "そとへ",
   "feed": "外へ",
   "target": "A-1A-k2",
   "accent": {
    "src": "外へ",
    "moras": [
     "そ",
     "と",
     "へ"
    ],
    "hl": [
     1,
     0,
     0
    ],
    "ap": [
     0,
     0,
     0
    ],
    "phrases": [
     {
      "moras": 3,
      "kernel": 1
     }
    ],
    "tool": "apps/audio/accent.py (pyopenjtalk)"
   }
  },
  {
   "id": "A-1A-k2-lc2",
   "word": "えきまで",
   "feed": "駅まで",
   "target": "A-1A-k2",
   "accent": {
    "src": "駅まで",
    "moras": [
     "え",
     "き",
     "ま",
     "で"
    ],
    "hl": [
     1,
     0,
     0,
     0
    ],
    "ap": [
     0,
     0,
     0,
     0
    ],
    "phrases": [
     {
      "moras": 4,
      "kernel": 1
     }
    ],
    "tool": "apps/audio/accent.py (pyopenjtalk)"
   }
  },
  {
   "id": "A-1A-k2-lc3",
   "word": "まちへ",
   "feed": "街へ",
   "target": "A-1A-k2",
   "accent": {
    "src": "街へ",
    "moras": [
     "ま",
     "ち",
     "へ"
    ],
    "hl": [
     0,
     1,
     0
    ],
    "ap": [
     0,
     0,
     0
    ],
    "phrases": [
     {
      "moras": 3,
      "kernel": 2
     }
    ],
    "tool": "apps/audio/accent.py (pyopenjtalk)"
   }
  },
  {
   "id": "A-1A-k2-lc4",
   "word": "にわへ",
   "feed": "庭へ",
   "target": "A-1A-k2",
   "accent": {
    "src": "庭へ",
    "moras": [
     "に",
     "わ",
     "へ"
    ],
    "hl": [
     0,
     1,
     1
    ],
    "ap": [
     0,
     0,
     0
    ],
    "phrases": [
     {
      "moras": 3,
      "kernel": 3
     }
    ],
    "tool": "apps/audio/accent.py (pyopenjtalk)"
   }
  }
 ],
 "melCands": [
  {
   "id": "A-C-k2-mc1",
   "target": "A-C-k2",
   "genNote": "読みの高低に沿わせて生成",
   "notes": [
    {
     "x": 0,
     "w": 14,
     "y": 14
    },
    {
     "x": 16,
     "w": 14,
     "y": 10
    },
    {
     "x": 32,
     "w": 14,
     "y": 10
    },
    {
     "x": 48,
     "w": 14,
     "y": 10
    },
    {
     "x": 128,
     "w": 14,
     "y": 13
    },
    {
     "x": 144,
     "w": 14,
     "y": 9
    },
    {
     "x": 160,
     "w": 14,
     "y": 13
    },
    {
     "x": 176,
     "w": 14,
     "y": 9
    },
    {
     "x": 192,
     "w": 14,
     "y": 13
    },
    {
     "x": 208,
     "w": 30,
     "y": 13
    },
    {
     "x": 240,
     "w": 30,
     "y": 9
    },
    {
     "x": 272,
     "w": 30,
     "y": 13
    }
   ]
  },
  {
   "id": "A-C-k2-mc2",
   "target": "A-C-k2",
   "genNote": "読みが変化する最初の対を逆向きに倒して生成",
   "notes": [
    {
     "x": 0,
     "w": 14,
     "y": 14
    },
    {
     "x": 16,
     "w": 14,
     "y": 18
    },
    {
     "x": 32,
     "w": 14,
     "y": 18
    },
    {
     "x": 48,
     "w": 14,
     "y": 18
    },
    {
     "x": 128,
     "w": 14,
     "y": 13
    },
    {
     "x": 144,
     "w": 14,
     "y": 9
    },
    {
     "x": 160,
     "w": 14,
     "y": 13
    },
    {
     "x": 176,
     "w": 14,
     "y": 9
    },
    {
     "x": 192,
     "w": 14,
     "y": 13
    },
    {
     "x": 208,
     "w": 30,
     "y": 13
    },
    {
     "x": 240,
     "w": 30,
     "y": 9
    },
    {
     "x": 272,
     "w": 30,
     "y": 13
    }
   ]
  },
  {
   "id": "A-C-k2-mc3",
   "target": "A-C-k2",
   "genNote": "読みに沿わせた列の末尾1音を落として生成",
   "notes": [
    {
     "x": 0,
     "w": 14,
     "y": 14
    },
    {
     "x": 16,
     "w": 14,
     "y": 10
    },
    {
     "x": 32,
     "w": 14,
     "y": 10
    },
    {
     "x": 48,
     "w": 14,
     "y": 10
    },
    {
     "x": 128,
     "w": 14,
     "y": 13
    },
    {
     "x": 144,
     "w": 14,
     "y": 9
    },
    {
     "x": 160,
     "w": 14,
     "y": 13
    },
    {
     "x": 176,
     "w": 14,
     "y": 9
    },
    {
     "x": 192,
     "w": 14,
     "y": 13
    },
    {
     "x": 208,
     "w": 30,
     "y": 13
    },
    {
     "x": 240,
     "w": 30,
     "y": 9
    }
   ]
  }
 ],
 "refs": {
  "isolationExample": "A-oosabi-p1",
  "lyrCandTarget": "A-1A-k2",
  "melCandTarget": "A-C-k2"
 }
};

/* ---- 索引と参照の検証（読み込み時に必ず走る。壊れた参照は即例外） ---- */
var P = {}, S = {}, PL = {}, CD = {};
function dup(id) { throw new Error("id重複: " + id); }
Object.keys(V7DATA.songs).forEach(function (k) {
  var sg = V7DATA.songs[k];
  (sg.sections || []).forEach(function (sec) {
    if (S[sec.id]) dup(sec.id); S[sec.id] = sec; sec.song = k;
    (sec.units || []).forEach(function (u) {
      if (P[u.id]) dup(u.id); P[u.id] = u; u.section = sec.id; u.song = k;
      if (u.plan) { if (PL[u.plan.id]) dup(u.plan.id); PL[u.plan.id] = u.plan; u.plan.owner = u.id; }
    });
  });
  (sg.stock || []).forEach(function (st) {
    if (P[st.id]) dup(st.id); P[st.id] = st; st.song = k; st.kind = "stock";
  });
});
function mustPhrase(id, where) { if (!P[id]) throw new Error(where + " が存在しない句を指す: " + id); }
function mustSection(id, where) { if (!S[id]) throw new Error(where + " が存在しないセクションを指す: " + id); }
Object.keys(S).forEach(function (id) { if (S[id].sameMelodyAs) mustSection(S[id].sameMelodyAs, id + ".sameMelodyAs"); });
Object.keys(P).forEach(function (id) {
  var u = P[id];
  if (u.sameAs) mustPhrase(u.sameAs, id + ".sameAs");
  if (u.notes && !Array.isArray(u.notes) && u.notes.ref) mustPhrase(u.notes.ref, id + ".notes.ref");
});
V7DATA.lyrCands.forEach(function (c) { if (CD[c.id]) dup(c.id); CD[c.id] = c; mustPhrase(c.target, c.id + ".target"); });
V7DATA.melCands.forEach(function (c) { if (CD[c.id]) dup(c.id); CD[c.id] = c; mustPhrase(c.target, c.id + ".target"); });
if (!PL[V7DATA.refs.isolationExample]) throw new Error("refs.isolationExample が存在しない予定を指す: " + V7DATA.refs.isolationExample);
mustPhrase(V7DATA.refs.lyrCandTarget, "refs.lyrCandTarget");
mustPhrase(V7DATA.refs.melCandTarget, "refs.melCandTarget");
V7DATA.phraseById = P;      // 句・stock（id → 実体）
V7DATA.sectionById = S;     // セクション
V7DATA.planById = PL;       // 予定
V7DATA.candById = CD;       // 詞候補・メロ候補

g.V7DATA = V7DATA;
if (typeof module !== "undefined" && module.exports) module.exports = V7DATA;
})(typeof window !== "undefined" ? window : globalThis);
