export const toHex = (n: number) =>
  `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;

let _localIdCounter = 0;
export const newLocalId = () => `local_${++_localIdCounter}`;
