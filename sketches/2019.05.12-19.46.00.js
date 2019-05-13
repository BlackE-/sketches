let canvasSketch = require('canvas-sketch')
let SimplexNoise = require('simplex-noise')
let Tone = require('tone')
let load = require('load-asset')
let create_regl = require('regl')
let plane_make = require('primitive-plane')
let hsluv = require('hsluv')
let seed = require('seed-random')
let mat4 = require('gl-mat4')
let vec3 = require('gl-vec3')

let settings = {
    context: 'webgl',
    animate: true,
    duration: 8,
    dimensions: [ 1024, 1024 ],
    attributes: {
        antialiase: true
    }
}
/*
let sketch = () => {
    return ({ context, width, height }) => {
        context.fillStyle = 'white'
        context.fillRect(0, 0, width, height)
        context.font = `${height/4}px FuturaStd-Bold, sans-serif`
        context.textAlign = 'center'
        context.textBaseline = "middle"
        context.fillStyle = 'hsla(0, 0%, 0%, 1)'
        context.fillText("Fishy", width/2, (height/2)-((height/4)/16))

        context.fillStyle = 'hsla(0, 50%, 50%, 0.5)'
        // context.fillRect(0, height/4, 40, height/4)
        // context.fillRect(0, (height/2)-((height/4)/2), 40, height/4)
    }
}
*/

let sketch = ({ gl, width, height }) => {

    const PI = Math.PI
    const TAU = PI * 2

    let clamp = (v, min, max) => v < min ? min : v > max ? max : v
    let lerp = (v0, v1, t) => (1-t)*v0+t*v1
    let map = (v, ds, de, rs, re) => rs+(re-rs)*((v-ds)/(de-ds))

    let seed_value = Math.floor(Math.random()*1000)
    let rand = seed(seed_value)
    let simplex = new SimplexNoise(seed_value)

    let regl = create_regl({
        gl,
        extensions: ['webgl_draw_buffers', 'oes_texture_float']
    })

    let text_make = function() {
        let canvas = document.createElement('canvas')
        let ctx = canvas.getContext('2d')

        canvas.width = width
        canvas.height = height

        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
        ctx.font = `${height/4}px FuturaStd-Bold, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = "middle"
        ctx.fillStyle = 'hsla(0, 0%, 0%, 1)'
        ctx.fillText("Fishy", width/2, (height/2)-((height/4)/16))

        ctx.fillStyle = 'hsla(0, 50%, 50%, 0.5)'

        return regl.texture(canvas)
    }

    let text = text_make()
    let plane = plane_make(1, 1, 8, 8)
    let pane = plane_make(1, 1, 8, 8)

    let bgc = hsluv.hsluvToRgb([0, 0, 90+rand()*10])
    let plane_colours = plane.cells.map((v) => {
        return [
            hsluv.hsluvToRgb([0, 0, rand()*40]),
            hsluv.hsluvToRgb([0, 0, rand()*40]),
            hsluv.hsluvToRgb([0, 0, rand()*40])
        ]
    })
    let plane_offsets = plane.cells.map((v, i) => {
        return [
            simplex.noise2D(v[0], v[1]),
            simplex.noise3D(v[0], v[1], v[2]),
            simplex.noise4D(v[0], v[1], v[2], i)
        ]
    })

    let plane_draw = regl({
        frag: `
        precision mediump float;
        #define PI 3.141592653589793
        uniform float u_time;
        uniform vec3 u_random;
        uniform vec2 u_resolution;
        uniform sampler2D u_text;

        varying float v_depth;
        varying vec2 v_uv;
        varying vec3 v_color;


        float map_range(float v, float ds, float de, float rs, float re) {
            return rs+(re-rs)*((v-ds)/(de-ds));
        }

        void main() {
            vec2 st = gl_FragCoord.xy/u_resolution.xy;
            vec4 color = texture2D(u_text, v_uv);
            gl_FragColor = vec4(color);
        }`,

        vert: `
        precision mediump float;
        #define PI 3.141592653589793
        uniform mat4 u_projection, u_view, u_matrix;
        attribute vec3 a_position, a_color, a_offset;
        attribute vec2 a_uv;

        uniform float u_time;

        varying float v_depth;
        varying vec2 v_uv;
        varying vec3 v_color;

        void main() {
            v_uv = a_uv;
            v_color = a_color;
            v_depth = a_position.z;
            vec3 position = a_position;
            position += sin(u_time*PI*2.0)*(a_offset*0.25);
            gl_Position = u_projection*u_view*u_matrix*vec4(position, 1.0);
        }`,

        attributes: {
            a_position: plane.positions,
            a_uv: plane.uvs,
            a_color: plane_colours,
            a_offset: plane_offsets
        },

        elements: plane.cells,

        uniforms: {
            u_view: ({time}, props) => {
                return mat4.lookAt([],
                    [0  , 0  , -0.5], // position of camera
                    [0.0, 0.0, 0.0], // point of view looking at
                    [0.0, 1.0, 0.0]  // pointing up
                )
            },
            u_matrix: (stats, props) => {
                let { u_time } = props
                let rot = mat4.rotate([], mat4.identity([]), u_time*TAU, [
                    1,
                    0,
                    0
                ])
                return mat4.scale([], rot, [ -1, -1, 1 ])
            },
            u_projection: ({viewportWidth, viewportHeight}) => {
                return mat4.perspective([],
                    PI/2, viewportWidth/viewportHeight, 0.01, 50)
            },
            u_time: regl.prop('u_time'),
            u_random: regl.prop('u_random'),
            u_resolution: regl.prop('u_resolution'),
            u_text: regl.prop('u_text')
        },
        blend: {
            enable: true,
            func: {
                srcRGB:   'src alpha',
                srcAlpha: 'src alpha',
                dstRGB:   'one minus src alpha',
                dstAlpha: 'one minus src alpha'
            }
        },
        primitive: 'triangles'
    })

    return ({ playhead }) => {
        regl.poll()
        regl.clear({color: [...bgc, 1], depth: 1})

        plane_draw([
            {
                u_time: playhead,
                u_resolution: [width, height],
                u_random: [rand(), rand(), rand()],
                u_text: text
            }
        ])

    }
}

canvasSketch(sketch, settings)

