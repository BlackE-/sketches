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
    duration: 8.777142857142858,
    dimensions: [ 1024, 1024 ],
    attributes: {
        antialiase: true
    }
}

let sketch = async ({ gl, width, height }) => {

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

        ctx.font = `${height/4}px FuturaStd-Bold, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = "middle"
        ctx.fillStyle = 'hsla(0, 0%, 0%, 1)'
        ctx.fillText("Fishy", width/2, (height/2)-((height/4)/16))

        ctx.fillStyle = 'hsla(0, 50%, 50%, 0.5)'

        return regl.texture(canvas)
    }

    let text = text_make()
    let plane = plane_make(1, 1, 64, 64)

    let bgc = hsluv.hsluvToRgb([rand()*360, rand()*50, rand()*100])
    let plane_colours = plane.cells.map((v) => {
        return [
            hsluv.hsluvToRgb([0, 0, rand()*40]),
            hsluv.hsluvToRgb([0, 0, rand()*40]),
            hsluv.hsluvToRgb([0, 0, rand()*40])
        ]
    })

    let plane_offsets = []
    for (let i = 0; i < plane.cells.length; ++i) {
        let val = plane.cells[i]
        for (let j = 0; j < val.length; ++j) {
            let s = 1.0
            let x = plane.positions[val[j]][0]*s
            let y = plane.positions[val[j]][1]*s
            let z = plane.positions[val[j]][2]*s
            plane_offsets.push([
                simplex.noise2D(x, y),
                simplex.noise3D(x, y, z),
                simplex.noise4D(x, y, z, i/(plane.cells.length-1))+simplex.noise4D(x*0.5, y*0.5, z*0.5, (i/(plane.cells.length-1))*0.5)
            ])
        }
    }

    // console.log(plane.positions[256])

    let plane_fft = regl.buffer({
        usage: 'dynamic',
        type: 'float',
    })

    let plane_draw = regl({
        frag: `
        precision mediump float;
        #define PI 3.141592653589793
        uniform float u_time;
        uniform vec3 u_random;
        uniform vec2 u_resolution;
        uniform sampler2D u_text;

        varying float v_depth, v_fft;
        varying vec2 v_uv;
        varying vec3 v_color;


        float map_range(float v, float ds, float de, float rs, float re) {
            return rs+(re-rs)*((v-ds)/(de-ds));
        }

        void main() {
            vec2 st = gl_FragCoord.xy/u_resolution.xy;
            float n = 1.0+floor(u_time*4.0);
            float m = 1.0/n;
            vec2 uv = v_uv;

            vec3 fc = gl_FragCoord.xyz;
            vec3 rr = refract(fc, vec3(sin(u_time*st.y*PI)*0.125), 0.5);
            vec3 rg = refract(fc, vec3(sin(u_time*st.y*PI)*0.125), 0.5);
            vec3 rb = refract(fc, vec3(sin(u_time*st.y*PI)*0.125), 0.3333);

            uv.x += u_time;
            // vec4 color = texture2D(u_text, mod(uv, m)*n);
            vec4 color = texture2D(u_text, uv);
            vec4 ref = refract(color, vec4(sin(u_time*st.y*PI)*0.5), 0.5);
            ref.r += sin(u_time*PI);
            ref.g += 1.0-sin(u_time*PI);
            // vec4 color = texture2D(u_text, vec2(rr.r, rg.g));
            gl_FragColor = vec4(ref);
        }`,

        vert: `
        precision mediump float;
        #define PI 3.141592653589793
        uniform mat4 u_projection, u_view, u_matrix;
        attribute vec3 a_position, a_color, a_offset;
        attribute float a_fft;
        attribute vec2 a_uv;

        uniform float u_time;

        varying float v_depth, v_fft;
        varying vec2 v_uv;
        varying vec3 v_color;

        void main() {
            v_uv = a_uv;
            v_color = a_color;
            v_depth = a_position.z;
            v_fft = a_fft;
            vec3 position = a_position;
            position.y += a_fft*0.125;
            position.z += sin(u_time*PI)*(a_offset.z*(sin(u_time*PI*8.0)+sin(position.y*PI))*0.025);
            gl_Position = u_projection*u_view*u_matrix*vec4(position, 1.0);
        }`,

        attributes: {
            a_position: plane.positions,
            a_uv: plane.uvs,
            a_color: plane_colours,
            a_offset: plane_offsets,
            a_fft: plane_fft
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
                let rot = mat4.rotate([], mat4.identity([]), TAU, [
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
            u_text: regl.prop('u_text'),
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

    let load_music = function(src) {
        let actx = new AudioContext()
        let source = actx.createBufferSource()

        let request = new Request(src)

        return new Promise(function(resolve, reject) {
            return fetch(request).then(function(response) {
                return response.arrayBuffer()
            }).then(function(buffer) {
                actx.decodeAudioData(buffer, function(decodedata) {
                    source.buffer = decodedata
                    source.connect(actx.destination)
                    resolve(source)
                })
            })
        })
    }

    let mp3 = await load_music('/assets/2019_05_17.mp3')

    let player = new Tone.Player()
    let fft = new Tone.FFT(plane.cells.length)
    player.buffer = new Tone.Buffer(mp3.buffer)
    player.loop = true
    player.connect(fft)
    player.toMaster()
    player.start()

    console.log(plane_fft)

    return ({ playhead }) => {
        let fft_v = fft.getValue()
        // console.log(fft_v[fft_v.length-1])

        regl.poll()
        regl.clear({color: [...bgc, 1], depth: 1})

        plane_fft({ data: fft_v.map(v => map(v, 0, -200, -1, 1)) })

        plane_draw([
            {
                u_time: playhead,
                u_resolution: [width, height],
                u_random: [rand(), rand(), rand()],
                u_text: text,
                u_fft: fft_v
            }
        ])

    }
}

canvasSketch(sketch, settings)

