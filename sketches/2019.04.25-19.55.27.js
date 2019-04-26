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
    duration: 9.27,
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

    let pane = plane_make(1, 1, 8, 8)

    let bgc = hsluv.hsluvToRgb([rand()*360, rand()*50, rand()*100])
    let pane_colour = rand()*360
    let pane_colours = pane.positions.map((_, i, a) => {
        let t = i/(a.length-1)
        return hsluv.hsluvToRgb([pane_colour, 50+rand()*25, 50+rand()*25])
    })

    let pane_offsets = pane.positions.map((v, i, a) => {
        let result = [
            simplex.noise2D(v[0], v[1])+(simplex.noise2D(v[0]*8, v[1]*8)*0.5),
            simplex.noise3D(v[0], v[1], v[2])+(simplex.noise3D(v[0]*8, v[1]*8, v[2]*8)*0.5),
            0
        ]
        return result
    })

    let pane_64fbo = regl.framebuffer({
        color: [
            regl.texture({ type: 'float', width: 64, height: 64 })
        ]
    })
    let pane_128fbo = regl.framebuffer({
        color: [
            regl.texture({ type: 'float', width: 128, height: 128 })
        ]
    })
    let pane_1024fbo = regl.framebuffer({
        color: [
            regl.texture({ type: 'float', width: 1024, height: 1024 })
        ]
    })

    let pane_draw_fbo = regl({
        frag: `
        precision mediump float;

        #define PI 3.141592653589793

        uniform float u_t, u_time, u_offset;
        uniform vec3 u_color, u_random;

        varying vec3 v_color;
        varying float v_depth, v_opacity;

        void main() {
            vec3 col = v_color;
            // gl_FragColor = vec4(col*u_t, 0.5+u_random*0.124);
            col += sin(u_time*PI)*0.125;
            gl_FragColor = vec4(col, 1.0);
        }`,
        vert: `
        precision mediump float;

        #define PI 3.141592653589793

        uniform float u_t, u_time;
        uniform vec3 u_random;
        uniform mat4 u_projection, u_view, u_matrix;
        attribute vec3 a_position, a_offset, a_color;

        varying vec3 v_color;
        varying float v_depth;
        varying float v_opacity;

        float map(float v, float ds, float de, float rs, float re) {
            return rs+(re-rs)*((v-ds)/(de-ds));
        }

        void main() {
            vec3 pos = a_position;
            vec3 off = a_offset;
            pos.xy += off.xy*0.125;

            // pos.xz += off.xy*sin(u_time*PI*2.0)*0.5;

            v_color = a_color;
            v_depth = pos.z;
            v_opacity = map(u_random.x, -8.0, 8.0, 0.0, 1.0);

            gl_Position = u_projection*u_view*u_matrix*vec4(pos, 1);
        }`,

        attributes: {
            a_position: pane.positions,
            a_color: pane_colours,
            a_offset: pane_offsets
        },

        elements: pane.cells,

        uniforms: {
            u_view: ({time}, props) => {
                let { u_time } = props
                return mat4.lookAt([],
                    [0  , 0  , -8 ], // position of camera
                    [0.0, 0.0, 0.0], // point of view looking at
                    [0.0, 1.0, 0.0]  // pointing up
                )
            },
            u_projection: ({viewportWidth, viewportHeight}) => {
                return mat4.perspective([],
                    PI/2, viewportWidth/viewportHeight, 0.01, 50)
            },
            u_matrix: (_, props) => {
                let { u_t, u_index, u_stride, u_random, u_time } = props
                let scale = 4

                let rot = mat4.rotate([], mat4.identity([]), u_time*TAU,
                    [1, 1, 0])
                let tra = mat4.translate([], rot,
                    [0, 0, map(u_t, 0, 1, -4, 4)])
                let mat = mat4.scale([], tra,
                    [4, 4, 4])
                return mat
            },
            u_t: regl.prop('u_t'),
            u_time: regl.prop('u_time'),
            u_random: regl.prop('u_random'),
            u_color: regl.prop('u_color')
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

        primitive: 'triangles',

        depth: { enable: true, mask: true }
        // framebuffer: pane_fbo
    })

    let viewport_draw = regl({
        frag: `
        precision mediump float;
        #define PI 3.141592653589793
        uniform sampler2D u_texture;
        uniform vec3 u_random;
        uniform vec3 u_fft;

        varying vec2 v_uv;

        void main() {
            vec4 texture = texture2D(u_texture, v_uv);
            vec3 rand = u_random;

            gl_FragColor = vec4(texture.bgr, 1.0);
        }`,
        vert: `
        precision mediump float;
        #define PI 3.141592653589793
        uniform mat4 u_projection, u_view, u_matrix;

        attribute vec3 a_position;
        attribute vec2 a_uv;

        uniform float u_time;
        uniform vec3 u_random, u_fft;

        varying vec2 v_uv;

        void main() {
            vec2 uv = a_uv;
            uv.x *= u_fft.z;
            v_uv = sin(fract(cos(uv*PI))*PI);
            gl_Position = u_projection*u_view*u_matrix*vec4(a_position, 1.0);
        }`,

        attributes: {
            a_position: pane.positions,
            a_uv: pane.uvs
        },

        elements: pane.cells,

        uniforms: {
            u_view: ({time}, props) => {
                return mat4.lookAt([],
                    [0  , 0  , 0.5], // position of camera
                    [0.0, 0.0, 0.0], // point of view looking at
                    [0.0, 1.0, 0.0]  // pointing up
                )
            },
            u_projection: ({viewportWidth, viewportHeight}) => {
                return mat4.perspective([],
                    PI/2, viewportWidth/viewportHeight, 0.01, 50)
            },
            u_time: regl.prop('u_time'),
            u_matrix: regl.prop('u_matrix'),
            u_texture: regl.prop('u_texture'),
            u_random: regl.prop('u_random'),
            u_fft: regl.prop('u_fft')
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

    let pane_elements = Array(512)
        .fill({})
        .map((_, i, a) => {
            return {
                u_random: [rand(), rand(), rand()],
                u_index: i,
                u_length: a.length-1,
                u_t: i/(a.length-1)
            }
        })

    let pane_element = {
        u_random: [rand(), rand(), rand()],
        u_index: 0,
        u_length: 0,
        u_t: 0
    }


    let player = new Tone.Player('/assets/2019_04_26.mp3').toMaster()
    let fft = new Tone.FFT(128*128)
    player.autostart = true
    player.loop = true
    player.connect(fft)

    return ({ playhead }) => {
        let fft_v = fft.getValue()

        regl.poll()
        regl.clear({color: [...bgc, 1], depth: 1})

        regl.clear({ color: bgc, depth: 1, framebuffer: pane_64fbo })
        regl.clear({ color: bgc, depth: 1, framebuffer: pane_128fbo })
        regl.clear({ color: bgc, depth: 1, framebuffer: pane_1024fbo })

        pane_64fbo.use(() => {
            pane_element.u_time = playhead;
            pane_draw_fbo(pane_elements.map((v) => {
                return Object.assign(v, { u_time: playhead }) }));
        })

        pane_1024fbo.use(() => {
            pane_element.u_time = playhead;
            pane_draw_fbo(pane_elements.map((v) => {
                return Object.assign(v, { u_time: playhead }) }));
        })

        viewport_draw([
            {
                u_matrix: mat4.translate([], mat4.identity([]), [0, 0, 0]),
                u_texture: pane_64fbo.color[0],
                u_random: [rand(), rand(), rand()],
                u_fft: [
                    map(fft_v[0], 0, -100, -1, 1),
                    map(fft_v[Math.floor(fft_v.length/2)], 0, -100, -1, 1),
                    map(fft_v[fft_v.length-1], 0, -100, -1, 1)
                ],
                u_time: playhead
            }
        ])
    }
}

canvasSketch(sketch, settings)

