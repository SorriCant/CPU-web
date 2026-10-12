export interface MiniGame {
  slug: string;
  name: string;
  summary: string;
  routeName: string;
  cover: string;
  hue: "blue" | "orange";
  tags: string[];
  /** 本机最高分的 localStorage 键；合集页的“我的最高”取它和云端最高分里较大的一个。 */
  bestStorageKey: string;
  /** 排行榜接口，登录后返回的 me.bestScore 是账号在所有设备上的最高分。 */
  leaderboardPath: string;
}

// 合集页的路径。两个游戏页的路径都在 /services/tools/yaoda-can-fly 之下：
// 已发布的原生壳只对这个前缀隐藏自己的顶栏和底栏，新游戏放在别处会被底栏挡住。
export const MINI_GAMES_PATH = "/services/tools/games";

export const miniGames: MiniGame[] = [
  {
    slug: "yaoda-can-fly",
    name: "药大人能飞",
    summary: "操控飞行胶囊，穿过一座座药学实验装置",
    routeName: "service-yaoda-can-fly",
    cover: "🛫",
    hue: "blue",
    tags: ["全校排行", "14 枚成就"],
    bestStorageKey: "cpu-web:yaoda-can-fly:v2:best",
    leaderboardPath: "/tools/yaoda-can-fly/leaderboard",
  },
  {
    slug: "tomato-egg-noodles",
    name: "番茄鸡蛋面",
    summary: "切菜、炒蛋、煮面，看准火候做出一碗好面",
    routeName: "service-tomato-egg-noodles",
    cover: "🍜",
    hue: "orange",
    tags: ["全校排行", "14 枚成就"],
    bestStorageKey: "cpu-web:tomato-egg-noodles:v1:best",
    leaderboardPath: "/tools/tomato-egg-noodles/leaderboard",
  },
];
