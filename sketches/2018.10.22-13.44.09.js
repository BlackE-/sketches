let canvasSketch = require('canvas-sketch')
let seed = require('seed-random')
let vec = require('vec-la')

let settings = {
    animate: true,
    duration: 4,
    dimensions: [ 1024, 1024 ]
}

let sketch = ({width, height}) => {

    const PI = Math.PI
    const TAU = PI * 2

    let seed_value = Math.floor(Math.random()*1000)
    let rand = seed(seed_value)

    let l = 1
    let lights = []
    for (let i = 0; i <= l; ++i) {
        let x = width/2+Math.cos(i/l*TAU)*(width/2-128)
        let y = width/2+Math.sin(i/l*TAU)*(width/2-128)
        lights.push({
            pos: [x, y],
            size: [width*0.0125, width*0.0125]
        })
    }

    let n = 16
    let walls = []
    for (let i = 0; i <= n; ++i) {
        walls.push({
            pos: [
                width*0.125+rand()*width*0.75,
                height*0.125+rand()*height*0.75
            ],
            size: [
                width*(rand()*0.125),
                height*(rand()*0.125)
            ]
        })
    }

    let shadows = []

    return ({ context: ctx, width, height, playhead }) => {
        ctx.fillStyle = 'hsla(0, 0%, 65%, 1)'
        ctx.fillRect(0, 0, width, height)

        for (let i = 0; i < walls.length; ++i) {
            let wall = walls[i]

            for (let j = 0; j < lights.length; ++j) {
                let light = lights[j]
                let half_width = wall.size[0]/2
                let half_height = wall.size[1]/2


                let p0 = vec.sub(wall.pos, vec.scale(wall.size, 0.5))

                let points = [
                    vec.sub(wall.pos, vec.scale(wall.size, 0.5)),
                    [
                        wall.pos[0]-wall.size[0]/2,
                        wall.pos[1]+wall.size[1]/2
                    ],[
                        wall.pos[0]+wall.size[0]/2,
                        wall.pos[1]-wall.size[1]/2
                    ],
                    vec.add(wall.pos, vec.scale(wall.size, 0.5))
                ]

                let options = [
                    [points[0], points[2]],
                    [points[0], points[3]],
                    [points[1], points[2]],
                    [points[1], points[3]]
                ]

                let biggest_dot = [0, 0]
                for (let i = 0; i < options.length; ++i) {
                    let dot = vec.dot(
                        vec.norm(vec.sub(options[i][0], light.pos)),
                        vec.norm(vec.sub(options[i][1], light.pos))
                    )
                    if (i === 0) {
                        biggest_dot[0] = i
                        biggest_dot[1] = dot
                    }
                    if (dot < biggest_dot[1]) {
                        biggest_dot[0] = i
                        biggest_dot[1] = dot
                    }
                }

                let result = options[biggest_dot[0]]

                ctx.save()
                ctx.fillStyle = 'hsla(0, 0%, 65%, 1)'
                ctx.beginPath()
                ctx.moveTo(...light.pos)
                ctx.lineTo(...result[0])
                ctx.lineTo(...result[1])
                ctx.closePath()
                ctx.fill()
                ctx.restore()

                shadows.push(result[0])
                shadows.push(result[1])

            }
        }

        for (let i = 0; i < shadows.length; i += 2) {
            ctx.save()
            ctx.fillStyle = 'hsla(0, 0%, 5%, 1)'
            ctx.beginPath()
            ctx.moveTo(...shadows[i])
            ctx.lineTo(
                ...vec.add(
                    shadows[i],
                    vec.scale(
                        vec.norm(vec.sub(shadows[i], lights[0].pos)),
                        900
                    )
                )
            )
            ctx.lineTo(
                ...vec.add(
                    shadows[i+1],
                    vec.scale(
                        vec.norm(vec.sub(shadows[i+1], lights[0].pos)),
                        900
                    )
                )
            )
            ctx.lineTo(...shadows[i+1])
            ctx.closePath()
            ctx.fill()
            ctx.restore()
        }

        for (let i = 0; i < walls.length; ++i) {
            let wall = walls[i]
            ctx.save()
            ctx.fillStyle = 'hsla(0, 0%, 90%, 1)'
            ctx.fillRect(
                wall.pos[0]-wall.size[0]/2,
                wall.pos[1]-wall.size[1]/2,
                wall.size[0],
                wall.size[1]
            )
            ctx.restore()
        }

        for (let i = 0; i < lights.length; ++i) {
            let half = width/2
            let light = lights[i]
            ctx.save()
            ctx.fillStyle = 'hsla(0, 0%, 10%, 1)'
            ctx.beginPath()
            ctx.arc(...light.pos, light.size[0], 0, TAU)
            ctx.closePath()
            ctx.fill()
            ctx.restore()

            // let n = i/lights.length
            // light.pos[0] = half+Math.sin(playhead*TAU+(n*PI))*(half-128)
            // light.pos[1] = half+Math.cos(playhead*TAU+(i*PI))*(half-128)
        }

    }
}

canvasSketch(sketch, settings)
