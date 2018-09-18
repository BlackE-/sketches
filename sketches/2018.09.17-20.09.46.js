let canvasSketch = require('canvas-sketch')

let settings = {
    animate: true,
    duration: 4,
    dimensions: [ 1024, 1024 ]
}

let sketch = () => {

    const PI = Math.PI
    const TAU = PI * 2

    return ({ context: ctx, width, height, playhead }) => {
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)

        ctx.fillStyle = 'hsla(0, 50%, 50%, 1)'
        ctx.fillRect(0, 0, width * 0.5, height * 0.5)

        let n = 4
        for (let i = 0; i <= n; ++i) {
            let t = Math.sin(playhead * PI)
            ctx.fillStyle = 'hsla(0, 0%, 0%, 1)'
            ctx.fillRect(width * 0.125 * i * t, height * 0.125 * i, 16, 16)
        }


        // @NOTE(Grey) First flip, horizontal to the right half
        let d = ctx.getImageData(0, 0, width * 0.5, height * 0.5)
        let f = ctx.createImageData(d)
        for (let i = 0; i < d.data.length; i += 4) {
            let w = d.width * 4
            let y = Math.floor(i / w)

            let p0 = ((w + (w * y)) - (i + 0) + (w * y)) - 1
            let p1 = ((w + (w * y)) - (i + 1) + (w * y)) - 1
            let p2 = ((w + (w * y)) - (i + 2) + (w * y)) - 1
            let p3 = ((w + (w * y)) - (i + 3) + (w * y)) - 1
            f.data[i + 0] = d.data[p3]
            f.data[i + 1] = d.data[p2]
            f.data[i + 2] = d.data[p1]
            f.data[i + 3] = d.data[p0]
        }

        ctx.putImageData(f, width / 2, 0)

        // @NOTE(Grey) Second flip, whol top half to bottom half
        let t = ctx.getImageData(0, 0, width, height * 0.5)
        let r = ctx.createImageData(t)
        for (let i = 0; i < t.data.length; i += 4) {
            let h = d.height * 4
            let y = (t.data.length / h) - Math.floor(i / h)

            let p0 = ((y * h) - ((i + 0) % h)) - 1
            let p1 = ((y * h) - ((i + 1) % h)) - 1
            let p2 = ((y * h) - ((i + 2) % h)) - 1
            let p3 = ((y * h) - ((i + 3) % h)) - 1

            r.data[i + 0] = t.data[p3]
            r.data[i + 1] = t.data[p2]
            r.data[i + 2] = t.data[p1]
            r.data[i + 3] = t.data[p0]
        }

        ctx.putImageData(r, 0, height / 2)


    }
}

canvasSketch(sketch, settings)

/*


[
    0,  1,  2,  3,
    4,  5,  6,  7,
    8,  9,  10, 11,
    12, 13, 14, 15
]

h   i   new index
4 + 0 = 4
4 + 1 = 5
4 + 2 = 6
4 + 3 = 7


[
    12, 13, 14, 15,
    8,  9,  10, 11,
    4,  5,  6,  7,
    0,  1,  2,  3
]



width | index | offset | correction | new index
------------------------------------------------
12 -  | 11 +  | 8 -    | 1          | = 9
12 -  | 10 +  | 8 -    | 1          | = 10
12 -  | 9  +  | 8 -    | 1          | = 11
12 -  | 8  +  | 8 -    | 1          | = 12

8  -  | 7  +  | 4 -    | 1          | = 5
8  -  | 6  +  | 4 -    | 1          | = 6
8  -  | 5  +  | 4 -    | 1          | = 7
8  -  | 4  +  | 4 -    | 1          | = 8

4  -  | 3  +  | 0 -    | 1          | = 1
4  -  | 2  +  | 0 -    | 1          | = 2
4  -  | 1  +  | 0 -    | 1          | = 3
4  -  | 0  +  | 0 -    | 1          | = 4

[
    3, 2, 1, 0,
    7, 6, 5, 4,
    11, 10, 9 8
]


*/
