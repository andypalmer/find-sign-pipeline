// the shape of a vector: anything array-like that maps to another, such as a Float32Array or number[]
export type Vector = ArrayLike<number> & { map (fn: (value: number, index: number) => number): Vector }
