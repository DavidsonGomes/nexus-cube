// Adapted from Cube Coach, MIT. See docs/sources-and-licenses.md.
import type { AlgorithmCase } from '../domain/types';
export const F2L_CASES: readonly Omit<AlgorithmCase,'initialState'>[] = [
  {
    "id": "cfop/f2l/01",
    "family": "F2L",
    "name": "Inserção básica 1",
    "aliases": [
      "F2L 1",
      "F2L1",
      "Basic Insert"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Inserção básica",
    "algorithm": "U R U' R'",
    "alternatives": [],
    "setup": "R U R' U'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/02",
    "family": "F2L",
    "name": "Inserção básica 2",
    "aliases": [
      "F2L 2",
      "F2L2",
      "Basic Insert"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Inserção básica",
    "algorithm": "y' U' R' U R y",
    "alternatives": [
      "y U' L' U L y'"
    ],
    "setup": "y' R' U' R U y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/03",
    "family": "F2L",
    "name": "Inserção básica 3",
    "aliases": [
      "F2L 3",
      "F2L3",
      "Basic Insert"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Inserção básica",
    "algorithm": "y' R' U' R y",
    "alternatives": [
      "y L' U' L y'"
    ],
    "setup": "y' R' U R y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/04",
    "family": "F2L",
    "name": "Inserção básica 4",
    "aliases": [
      "F2L 4",
      "F2L4",
      "Basic Insert"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Inserção básica",
    "algorithm": "R U R'",
    "alternatives": [],
    "setup": "R U' R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/05",
    "family": "F2L",
    "name": "Cores superiores diferentes 1",
    "aliases": [
      "F2L 5",
      "F2L5",
      "Different Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores diferentes",
    "algorithm": "U' R U' R' U y' R' U' R y",
    "alternatives": [
      "y' U R' U' R U' R' U' R y"
    ],
    "setup": "y' R' U R y U' R U R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/06",
    "family": "F2L",
    "name": "Cores superiores diferentes 2",
    "aliases": [
      "F2L 6",
      "F2L6",
      "Different Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores diferentes",
    "algorithm": "U' R U R' U R U R'",
    "alternatives": [],
    "setup": "R U' R' U' R U' R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/07",
    "family": "F2L",
    "name": "Cores superiores diferentes 3",
    "aliases": [
      "F2L 7",
      "F2L7",
      "Different Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores diferentes",
    "algorithm": "U' R U2 R' U y' R' U' R y",
    "alternatives": [
      "U' R U2 R' d R' U' R y"
    ],
    "setup": "y' R' U R y U' R U2 R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/08",
    "family": "F2L",
    "name": "Cores superiores diferentes 4",
    "aliases": [
      "F2L 8",
      "F2L8",
      "Different Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores diferentes",
    "algorithm": "R' U2 R2 U R2 U R",
    "alternatives": [
      "y' U R' U2 R U' y R U R'",
      "R U' R' U R U' R' U2 R U' R'"
    ],
    "setup": "R' U' R2 U' R2 U2 R",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/09",
    "family": "F2L",
    "name": "Cores superiores diferentes 5",
    "aliases": [
      "F2L 9",
      "F2L9",
      "Different Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores diferentes",
    "algorithm": "y' U R' U R U' R' U' R y",
    "alternatives": [],
    "setup": "y' R' U R U R' U' R U' y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/10",
    "family": "F2L",
    "name": "Cores superiores diferentes 6",
    "aliases": [
      "F2L 10",
      "F2L10",
      "Different Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores diferentes",
    "algorithm": "U' R U' R' U R U R'",
    "alternatives": [],
    "setup": "R U' R' U' R U R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/11",
    "family": "F2L",
    "name": "Cores superiores iguais 1",
    "aliases": [
      "F2L 11",
      "F2L11",
      "Same Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores iguais",
    "algorithm": "U' R U R' U2 R U' R'",
    "alternatives": [],
    "setup": "R U R' U2 R U' R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/12",
    "family": "F2L",
    "name": "Cores superiores iguais 2",
    "aliases": [
      "F2L 12",
      "F2L12",
      "Same Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores iguais",
    "algorithm": "y' U R' U' R U2 R' U R y",
    "alternatives": [
      "d R' U' R U2 R' U R y"
    ],
    "setup": "y' R' U' R U2 R' U R U' y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/13",
    "family": "F2L",
    "name": "Cores superiores iguais 3",
    "aliases": [
      "F2L 13",
      "F2L13",
      "Same Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores iguais",
    "algorithm": "U' R U2 R' U2 R U' R'",
    "alternatives": [],
    "setup": "R U R' U2 R U2 R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/14",
    "family": "F2L",
    "name": "Cores superiores iguais 4",
    "aliases": [
      "F2L 14",
      "F2L14",
      "Same Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Cores superiores iguais",
    "algorithm": "y' U R' U2 R U2 R' U R y",
    "alternatives": [
      "d R' U2 R U2 R' U R y"
    ],
    "setup": "y' R' U' R U2 R' U2 R U' y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/15",
    "family": "F2L",
    "name": "Branco para cima 1",
    "aliases": [
      "F2L 15",
      "F2L15",
      "White Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Branco para cima",
    "algorithm": "U R U2 R' U R U' R'",
    "alternatives": [],
    "setup": "R U R' U' R U2 R' U'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/16",
    "family": "F2L",
    "name": "Branco para cima 2",
    "aliases": [
      "F2L 16",
      "F2L16",
      "White Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Branco para cima",
    "algorithm": "y' U' R' U2 R U' R' U R y",
    "alternatives": [],
    "setup": "y' R' U' R U R' U2 R U y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/17",
    "family": "F2L",
    "name": "Branco para cima 3",
    "aliases": [
      "F2L 17",
      "F2L17",
      "White Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Branco para cima",
    "algorithm": "U2 R U R' U R U' R'",
    "alternatives": [
      "R U' R' U2 R U R'"
    ],
    "setup": "R U R' U' R U' R' U2",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/18",
    "family": "F2L",
    "name": "Branco para cima 4",
    "aliases": [
      "F2L 18",
      "F2L18",
      "White Facing Up"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Branco para cima",
    "algorithm": "y' U2 R' U' R U' R' U R y",
    "alternatives": [],
    "setup": "y' R' U' R U R' U R U2 y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/19",
    "family": "F2L",
    "name": "Par conectado incorretamente 1",
    "aliases": [
      "F2L 19",
      "F2L19",
      "Incorrectly Connected"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Par conectado incorretamente",
    "algorithm": "y' R' U R U2 y R U R'",
    "alternatives": [
      "R U R' U2 R U' R' U R U' R'"
    ],
    "setup": "R U' R' y' U2 R' U' R y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/20",
    "family": "F2L",
    "name": "Par conectado incorretamente 2",
    "aliases": [
      "F2L 20",
      "F2L20",
      "Incorrectly Connected"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Par conectado incorretamente",
    "algorithm": "R U' R' U2 y' R' U' R y",
    "alternatives": [
      "U F R U R' U' F' U R U' R'"
    ],
    "setup": "y' R' U R y U2 R U R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/21",
    "family": "F2L",
    "name": "Par conectado incorretamente 3",
    "aliases": [
      "F2L 21",
      "F2L21",
      "Incorrectly Connected"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Par conectado incorretamente",
    "algorithm": "R U2 R' U' R U R'",
    "alternatives": [],
    "setup": "R U' R' U R U2 R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/22",
    "family": "F2L",
    "name": "Par conectado incorretamente 4",
    "aliases": [
      "F2L 22",
      "F2L22",
      "Incorrectly Connected"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Par conectado incorretamente",
    "algorithm": "y' R' U2 R U R' U' R y",
    "alternatives": [],
    "setup": "y' R' U R U' R' U2 R y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/23",
    "family": "F2L",
    "name": "Par conectado incorretamente 5",
    "aliases": [
      "F2L 23",
      "F2L23",
      "Incorrectly Connected"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Par conectado incorretamente",
    "algorithm": "U R U' R' U' R U' R' U R U' R'",
    "alternatives": [
      "R U R' U2 R U R' U' R U R'"
    ],
    "setup": "R U R' U' R U R' U R U R' U'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/24",
    "family": "F2L",
    "name": "Par conectado incorretamente 6",
    "aliases": [
      "F2L 24",
      "F2L24",
      "Incorrectly Connected"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Par conectado incorretamente",
    "algorithm": "y' U' R' U R U R' U R U' R' U R y",
    "alternatives": [
      "F U R U' R' F' R U' R'"
    ],
    "setup": "y' R' U' R U R' U' R U' R' U' R U y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/25",
    "family": "F2L",
    "name": "Canto no slot, aresta fora 1",
    "aliases": [
      "F2L 25",
      "F2L25",
      "Corner In Edge Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Canto no slot, aresta fora",
    "algorithm": "U' F' R U R' U' R' F R",
    "alternatives": [
      "R' F' R U R U' R' F"
    ],
    "setup": "R' F' R U R U' R' F U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/26",
    "family": "F2L",
    "name": "Canto no slot, aresta fora 2",
    "aliases": [
      "F2L 26",
      "F2L26",
      "Corner In Edge Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Canto no slot, aresta fora",
    "algorithm": "U R U' R' U' F' U F",
    "alternatives": [
      "U R U' R' F R' F' R"
    ],
    "setup": "F' U' F U R U R' U'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/27",
    "family": "F2L",
    "name": "Canto no slot, aresta fora 3",
    "aliases": [
      "F2L 27",
      "F2L27",
      "Corner In Edge Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Canto no slot, aresta fora",
    "algorithm": "R U' R' U R U' R'",
    "alternatives": [],
    "setup": "R U R' U' R U R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/28",
    "family": "F2L",
    "name": "Canto no slot, aresta fora 4",
    "aliases": [
      "F2L 28",
      "F2L28",
      "Corner In Edge Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Canto no slot, aresta fora",
    "algorithm": "y' R' U R U' R' U R y",
    "alternatives": [],
    "setup": "y' R' U' R U R' U' R y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/29",
    "family": "F2L",
    "name": "Canto no slot, aresta fora 5",
    "aliases": [
      "F2L 29",
      "F2L29",
      "Corner In Edge Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Canto no slot, aresta fora",
    "algorithm": "y' R' U' R U R' U' R y",
    "alternatives": [
      "R' F R F' U R U' R'"
    ],
    "setup": "y' R' U R U' R' U R y",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/30",
    "family": "F2L",
    "name": "Canto no slot, aresta fora 6",
    "aliases": [
      "F2L 30",
      "F2L30",
      "Corner In Edge Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Canto no slot, aresta fora",
    "algorithm": "R U R' U' R U R'",
    "alternatives": [],
    "setup": "R U' R' U R U' R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/31",
    "family": "F2L",
    "name": "Aresta no slot, canto fora 1",
    "aliases": [
      "F2L 31",
      "F2L31",
      "Edge In Corner Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Aresta no slot, canto fora",
    "algorithm": "R U' R' U y' R' U R y",
    "alternatives": [
      "U' R' F R F' R U' R'"
    ],
    "setup": "y' R' U' R y U' R U R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/32",
    "family": "F2L",
    "name": "Aresta no slot, canto fora 2",
    "aliases": [
      "F2L 32",
      "F2L32",
      "Edge In Corner Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Aresta no slot, canto fora",
    "algorithm": "U R U' R' U R U' R' U R U' R'",
    "alternatives": [],
    "setup": "R U R' U' R U R' U' R U R' U'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/33",
    "family": "F2L",
    "name": "Aresta no slot, canto fora 3",
    "aliases": [
      "F2L 33",
      "F2L33",
      "Edge In Corner Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Aresta no slot, canto fora",
    "algorithm": "U' R U' R' U2 R U' R'",
    "alternatives": [],
    "setup": "R U R' U2 R U R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/34",
    "family": "F2L",
    "name": "Aresta no slot, canto fora 4",
    "aliases": [
      "F2L 34",
      "F2L34",
      "Edge In Corner Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Aresta no slot, canto fora",
    "algorithm": "U R U R' U2 R U R'",
    "alternatives": [],
    "setup": "R U' R' U2 R U' R' U'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/35",
    "family": "F2L",
    "name": "Aresta no slot, canto fora 5",
    "aliases": [
      "F2L 35",
      "F2L35",
      "Edge In Corner Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Aresta no slot, canto fora",
    "algorithm": "U' R U R' U y' R' U' R y",
    "alternatives": [],
    "setup": "y' R' U R y U' R U' R' U",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/36",
    "family": "F2L",
    "name": "Aresta no slot, canto fora 6",
    "aliases": [
      "F2L 36",
      "F2L36",
      "Edge In Corner Out"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Aresta no slot, canto fora",
    "algorithm": "U F' U' F U' R U R'",
    "alternatives": [],
    "setup": "R U' R' U F' U F U'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/37",
    "family": "F2L",
    "name": "Ambas as pecas no slot 1",
    "aliases": [
      "F2L 37",
      "F2L37",
      "Both In Slot"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Ambas as pecas no slot",
    "algorithm": "R U' R' d R' U2 R U2 R' U R y",
    "alternatives": [],
    "setup": "y' R' U' R U2 R' U2 R d' R U R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/38",
    "family": "F2L",
    "name": "Ambas as pecas no slot 2",
    "aliases": [
      "F2L 38",
      "F2L38",
      "Both In Slot"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Ambas as pecas no slot",
    "algorithm": "R U' R' U' R U R' U2 R U' R'",
    "alternatives": [
      "R U R' U' R U2 R' U' R U R'"
    ],
    "setup": "R U R' U2 R U' R' U R U R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/39",
    "family": "F2L",
    "name": "Ambas as pecas no slot 3",
    "aliases": [
      "F2L 39",
      "F2L39",
      "Both In Slot"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Ambas as pecas no slot",
    "algorithm": "R U' R' U R U2 R' U R U' R'",
    "alternatives": [
      "R U R' U2 R U' R' U R U R'"
    ],
    "setup": "R U R' U' R U2 R' U' R U R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/40",
    "family": "F2L",
    "name": "Ambas as pecas no slot 4",
    "aliases": [
      "F2L 40",
      "F2L40",
      "Both In Slot"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Ambas as pecas no slot",
    "algorithm": "F' U F U2 R U R' U R U' R'",
    "alternatives": [
      "R U' R' F R U R' U' F' R U' R'"
    ],
    "setup": "R U R' U' R U' R' U2 F' U' F",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  },
  {
    "id": "cfop/f2l/41",
    "family": "F2L",
    "name": "Ambas as pecas no slot 5",
    "aliases": [
      "F2L 41",
      "F2L41",
      "Both In Slot"
    ],
    "nameKind": "descriptive",
    "nameSource": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts",
    "group": "Ambas as pecas no slot",
    "algorithm": "R U R' U' R U' R' U2 y' R' U' R y",
    "alternatives": [],
    "setup": "y' R' U R y U2 R U R' U R U' R'",
    "twoLook": false,
    "source": "https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts"
  }
];
