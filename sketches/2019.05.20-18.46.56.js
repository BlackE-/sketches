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

    let text_make = function(colour) {
        let canvas = document.createElement('canvas')
        let ctx = canvas.getContext('2d')
        let fs = 84

        canvas.width = 1024
        canvas.height = 128
        ctx.fillStyle = 'hsla(0, 0%, 0%, 1)'
        ctx.font = `${fs}px UniversLTStd-BoldEx,sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('i don’t want to fit in', canvas.width/2, fs)

        return regl.texture({ data: canvas, wrapS: 'repeat' })
    }

    let text = text_make()
    let plane = plane_make(1, 94/1024, 8, 8)

    let bgc = hsluv.hsluvToRgb([0, 0, 40+rand()*60])
    // console.log(bgc)
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
        uniform vec3 u_random, u_colour;
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
            vec2 uv = v_uv;
            float dir = u_random.x > 0.5 ? u_time : -u_time;
            uv.x += sin((sin(+dir*st.x*PI)+dir)*PI)*(u_random.x+u_random.y)+dir;
            vec4 color = texture2D(u_text, uv);
            color.rgb = u_colour.brg;
            color.rgb = (color.rgb+u_random.r+u_random.g)*u_random.b;
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
                    [0  , 0  , -1], // position of camera
                    [0.0, 0.0, 0.0], // point of view looking at
                    [0.0, 1.0, 0.0]  // pointing up
                )
            },
            u_matrix: (stats, props) => {
                let { u_time, u_index, u_random } = props
                let tra = mat4.translate([], mat4.identity([]), [
                    0,
                    map(u_index, 0, 1, -0.65, 0.65),
                    0
                ])
                let rot = mat4.rotate([], tra, TAU, [ 1, 1, 1 ])
                let s = 2
                return mat4.scale([], rot, [ -s, -s, s ])
            },
            u_projection: ({viewportWidth, viewportHeight}) => {
                return mat4.perspective([],
                    PI/2, viewportWidth/viewportHeight, 0.01, 50)
            },
            u_time: regl.prop('u_time'),
            u_random: regl.prop('u_random'),
            u_resolution: regl.prop('u_resolution'),
            u_text: regl.prop('u_text'),
            u_colour: regl.prop('u_colour')
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

    let plane_elements = Array(8)
        .fill({})
        .map(function(value, index, array) {
            return {
                u_resolution: [width, height],
                u_random: [rand(), rand(), rand()],
                u_text: text,
                u_index: index/(array.length-1),
                u_colour: hsluv.hsluvToRgb([0, 0, rand()*80])
            }
        })

    return ({ playhead }) => {
        regl.poll()
        regl.clear({color: [...bgc, 1], depth: 1})

        plane_draw(plane_elements.map(function(value) {
            return Object.assign(value, {u_time: playhead})
        }))

    }
}

canvasSketch(sketch, settings)


