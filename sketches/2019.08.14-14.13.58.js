let canvasSketch = require('canvas-sketch')
let SimplexNoise = require('simplex-noise')
let Tone = require('tone')
let load = require('load-asset')
let create_regl = require('regl')
let icosphere_make = require('primitive-icosphere')
let cube_make = require('primitive-cube')
let plane_make = require('primitive-plane')
let torus_make = require('primitive-torus')
let hsluv = require('hsluv')
let seed = require('seed-random')
let mat4 = require('gl-mat4')
let vec3 = require('gl-vec3')

let settings = {
    context: 'webgl',
    animate: true,
    duration: 8.49,
    dimensions: [ 1024, 1024 ],
    attributes: {
        antialiase: true
    }
}

let sketch = async ({ gl, width, height }) => {

    const PI = Math.PI
    const TAU = PI * 2
    const N = 128

    let clamp = (v, min, max) => v < min ? min : v > max ? max : v
    let lerp = (v0, v1, t) => (1-t)*v0+t*v1
    let map = (v, ds, de, rs, re) => rs+(re-rs)*((v-ds)/(de-ds))
    let ease = (p, g) => {
      if (p < 0.5)
        return 0.5 * Math.pow(2*p, g)
      else
        return 1 - 0.5 * Math.pow(2*(1 - p), g)
    }

    let seed_value = Math.floor(Math.random()*1000)
    let rand = seed(seed_value)
    let simplex = new SimplexNoise(seed_value)
    let load_sound = function(str) {
        return new Promise(function(resolve, reject) {
            new Tone.Player(str, function(player) {
                resolve(player)
            })
        })
    }

    let regl = create_regl({
        gl,
        extensions: ['webgl_draw_buffers', 'oes_texture_float', 'oes_standard_derivatives']
    })

    let text_make = function(colour) {
        let canvas = document.createElement('canvas')
        let ctx = canvas.getContext('2d')
        let scale = 8.0
        let fs = 24*scale

        canvas.width = 128*scale
        canvas.height = 128*scale
        ctx.fillStyle = 'hsla(0, 0%, 100%, 1)'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = 'hsla(0, 0%, 0%, 1)'
        ctx.font = `${fs}px Didot-bold,serif`
        ctx.textAlign = 'left'
        ctx.fillText('hypnotize', 8*scale, fs*2.0)

        return regl.texture({ data: canvas, wrapS: 'repeat', wrapT: 'repeat' })
    }



    let torus = torus_make({ majorSegments: 16, minorSegments: 8, arc: Math.PI*2.0 })
    let text = text_make()

    // @NOTE(Grey): This unwinds the data and calculates barycentric coordinates per vert
    let data = { normals: [], positions: [], barycentric: [], uvs: [] }

    for (let i = 0; i < torus.cells.length; ++i) {
        let c0 = torus.cells[i][0]
        let c1 = torus.cells[i][1]
        let c2 = torus.cells[i][2]

        data.normals.push(torus.normals[c0])
        data.normals.push(torus.normals[c1])
        data.normals.push(torus.normals[c2])

        data.positions.push(torus.positions[c0])
        data.positions.push(torus.positions[c1])
        data.positions.push(torus.positions[c2])

        // @NOTE(Grey) This is edge removal etc.
        let remove_edge = true
        let Q = remove_edge ? 1 : 0
        if (i%2 === 0) {
            data.barycentric.push([0, 0, 1])
            data.barycentric.push([0, 1, 0])
            data.barycentric.push([1, 0, Q])
        } else {
            data.barycentric.push([0, 1, 0])
            data.barycentric.push([0, 0, 1])
            data.barycentric.push([1, 0, Q])
        }

        data.uvs.push(torus.uvs[c0])
        data.uvs.push(torus.uvs[c1])
        data.uvs.push(torus.uvs[c2])
    }


    let bgc = hsluv.hsluvToRgb([rand()*360, rand()*100, rand()*100])

    let torus_colour = hsluv.hsluvToRgb([rand()*360, rand()*100, rand()*100])
    let torus_colours = data.positions.map((v, i, a) => {
        return [torus_colour, torus_colour, torus_colour]
    })

    data.colours = torus_colours

    let torus_target1024 = regl.framebuffer({
        color: [ regl.texture({ type: 'float', width: 1024, height: 1024 }) ]
    })
    let torus_target64 = regl.framebuffer({
        color: [ regl.texture({ type: 'float', width: 64, height: 64 }) ]
    })
    let torus_render_panel = plane_make()

    let torus_fft = regl.texture({
        shape: [N/4, N/4, 4],
        min: 'linear',
        mag: 'linear',
        wrapS: 'repeat',
        wrapT: 'repeat'
    })

    let torus_render = regl({
        frag: `
        precision mediump float;
        #define PI 3.141592653589793

        varying vec2 v_uv;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec3 u_random;
        uniform sampler2D u_texture0, u_texture1, u_biggie;

        void main() {
            vec2 st = gl_FragCoord.xy/u_resolution;
            vec2 uv = v_uv;
            float t = sin(u_time*PI);
            float s = 1.0;

            vec4 base = texture2D(u_biggie, u_random.xy);
            vec4 tex0 = texture2D(u_texture0, uv);
            vec4 tex1 = texture2D(u_texture1, uv);

            // vec3 color = smoothstep(tex1.rgb, tex0.rgb, vec3(st.y*t, st.y*t, st.y*t));
            vec4 color = mix(base, tex0, tex0.a);

            gl_FragColor = vec4(color);
        }
        `,
        vert: `
        attribute vec3 a_position;
        attribute vec2 a_uv;

        uniform mat4 u_projection, u_view, u_matrix;

        varying vec2 v_uv;

        void main() {
            v_uv = a_uv;
            gl_Position = u_projection*u_view*u_matrix*vec4(a_position, 1.0);
        }
        `,
        attributes: {
            a_position: torus_render_panel.positions,
            a_uv: torus_render_panel.uvs,
        },
        elements: torus_render_panel.cells,
        uniforms: {
            u_view: ({time}, props) => {
                return mat4.lookAt([],
                    [0.0, 0.0, 1.0], // position of camera
                    [0.0, 0.0, 0.0], // point of view looking at
                    [0.0, 1.0, 0.0]  // pointing up
                )
            },
            u_matrix: (stats, props) => {
                return mat4.scale([], mat4.identity([]), props.u_scale || [1, 1, 1])
            },
            u_projection: ({viewportWidth, viewportHeight}) => {
                return mat4.perspective([],
                    PI/2, viewportWidth/viewportHeight, 0.01, 50)
            },
            u_resolution: regl.prop('u_resolution'),
            u_random: regl.prop('u_random'),
            u_texture0: regl.prop('u_texture0'),
            u_texture1: regl.prop('u_texture1'),
            u_time: regl.prop('u_time'),
            u_biggie: regl.prop('u_biggie')
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

    let torus_draw = regl({
        frag: `
        #ifdef GL_OES_standard_derivatives
        #extension GL_OES_standard_derivatives : enable
        #endif
        precision mediump float;
        #define PI 3.141592653589793

        mat2 myt = mat2(0.12121212, 0.13131313, -0.13131313, 0.12121212);
        vec2 mys = vec2(1e4, 1e6);

        uniform float u_time, u_index, u_length;
        uniform vec3 u_random;
        uniform vec2 u_resolution;
        uniform sampler2D u_text, u_fft, u_biggie;

        varying float v_depth;
        varying vec2 v_uv;
        varying vec3 v_normal, v_vertex, v_color, v_barycentric;

        vec2 rhash(vec2 uv) {
            uv *= myt;
            uv *= mys;
            return fract(fract(uv/mys)*uv);
        }

        vec3 hash(vec3 p) {
            return fract(sin(vec3(dot(p, vec3(1.0, 57.0, 113.0)),
                                  dot(p, vec3(57.0, 113.0, 1.0)),
                                  dot(p, vec3(113.0, 1.0, 57.0))))*
                        43758.5453);
        }

        float voronoi2d(in vec2 point) {
            vec2 p = floor(point);
            vec2 f = fract(point);
            float res = 0.0;
            for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                    vec2 b = vec2(i, j);
                    vec2 r = vec2(b)-f+rhash(p+b);
                    res += 1.0/pow(dot(r, r), 8.0);
                }
            }
            return pow(1.0/res, 0.0625);
        }

        vec3 voronoi3d(in vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);

            float id = 0.0;
            vec2 res = vec2(100.0);
            for (int k = -1; k <= 1; k++) {
                for (int j = -1; j <= 1; j++) {
                    for (int i = -1; i <= 1; i++) {
                        vec3 b = vec3(float(i), float(j), float(k));
                        vec3 r = vec3(b)-f+hash(p+b);
                        float d = dot(r, r);

                        float cond = max(sign(res.x-d), 0.0);
                        float nCond = 1.0-cond;

                        float cond2 = nCond*max(sign(res.y-d), 0.0);
                        float nCond2 = 1.0-cond2;

                        id = (dot(p+b, vec3(1.0, 57.0, 113.0))*cond)+(id*nCond);
                        res = vec2(d, res.x)*cond+res*nCond;

                        res.y = cond2*d+nCond2*res.y;
                    }
                }
            }
            return vec3(sqrt(res), abs(id));
        }

        mat2 rotate2d(float angle) {
            return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        }

        float map_range(float v, float ds, float de, float rs, float re) {
            return rs+(re-rs)*((v-ds)/(de-ds));
        }

        float aastep(float threshold, float dist) {
            float afwidth = fwidth(dist)*0.5;
            return smoothstep(threshold-afwidth, threshold+afwidth, dist);
        }

        void main() {
            vec2 st = gl_FragCoord.xy/u_resolution.xy;
            vec2 uv = v_uv;
            vec2 uv_t = uv;
            vec3 barycentric = v_barycentric;
            vec4 fft = texture2D(u_fft, uv);

            float noise = voronoi2d((uv_t+u_random.xy)*1.25);
            uv_t.x -= u_time+(fft.x*0.025);
            uv_t.y += sin(u_time*PI+fft.y)*0.025;

            vec4 biggie = texture2D(u_biggie, u_random.xy);
            // vec4 biggie = texture2D(u_biggie, vec2(u_random.xy+u_time*PI));
            vec4 text = texture2D(u_text, uv_t);
            vec4 color = vec4(biggie.rgb*length(fft), 1.0);

            color.rgb = mix(color.rgb, vec3(vec3(1.0)-color.rgb), text.r);

            // @NOTE(Grey): lighting calculation for flat shading
            vec3 U = dFdx(v_vertex);
            vec3 V = dFdy(v_vertex);
            vec3 normal = normalize(cross(U,V));
            vec3 light_direction = normalize(vec3(0.2, 0.3, 0.7)*u_random);
            float light_intensity = dot(normal, light_direction);

            // @NOTE(Grey): Mesh wireframe calculation
            float linethickness = 0.0125;
            float d = min(min(barycentric.x, barycentric.y), barycentric.z);
            float edge = 1.0-aastep(linethickness, d);

            color.rgb *= light_intensity;
            color.rgb = mix(color.rgb, vec3(vec3(1.0)-color.rgb), edge);

            gl_FragColor = vec4(color);
        }`,

        vert: `
        precision mediump float;
        #define PI 3.141592653589793

        mat2 myt = mat2(0.12121212, 0.13131313, -0.13131313, 0.12121212);
        vec2 mys = vec2(1e4, 1e6);

        attribute vec3 a_position, a_color, a_normal, a_barycentric;
        attribute vec2 a_uv;

        uniform mat4 u_projection, u_view, u_matrix;
        uniform vec3 u_random;
        uniform vec2 u_resolution;
        uniform float u_time, u_index, u_length;
        uniform sampler2D u_text, u_fft;

        varying float v_depth;
        varying vec2 v_uv;
        varying vec3 v_normal, v_vertex, v_color, v_barycentric;

        vec2 rhash(vec2 uv) {
            uv *= myt;
            uv *= mys;
            return fract(fract(uv/mys)*uv);
        }

        vec3 hash(vec3 p) {
            return fract(sin(vec3(dot(p, vec3(1.0, 57.0, 113.0)),
                                  dot(p, vec3(57.0, 113.0, 1.0)),
                                  dot(p, vec3(113.0, 1.0, 57.0))))*
                        43758.5453);
        }

        float voronoi2d(in vec2 point) {
            vec2 p = floor(point);
            vec2 f = fract(point);
            float res = 0.0;
            for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                    vec2 b = vec2(i, j);
                    vec2 r = vec2(b)-f+rhash(p+b);
                    res += 1.0/pow(dot(r, r), 8.0);
                }
            }
            return pow(1.0/res, 0.0625);
        }

        vec3 voronoi3d(in vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);

            float id = 0.0;
            vec2 res = vec2(100.0);
            for (int k = -1; k <= 1; k++) {
                for (int j = -1; j <= 1; j++) {
                    for (int i = -1; i <= 1; i++) {
                        vec3 b = vec3(float(i), float(j), float(k));
                        vec3 r = vec3(b)-f+hash(p+b);
                        float d = dot(r, r);

                        float cond = max(sign(res.x-d), 0.0);
                        float nCond = 1.0-cond;

                        float cond2 = nCond*max(sign(res.y-d), 0.0);
                        float nCond2 = 1.0-cond2;

                        id = (dot(p+b, vec3(1.0, 57.0, 113.0))*cond)+(id*nCond);
                        res = vec2(d, res.x)*cond+res*nCond;

                        res.y = cond2*d+nCond2*res.y;
                    }
                }
            }
            return vec3(sqrt(res), abs(id));
        }

        mat2 rotate2d(float angle) {
            return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        }

        float map_range(float v, float ds, float de, float rs, float re) {
            return rs+(re-rs)*((v-ds)/(de-ds));
        }

        float ease(float p, float g) {
            if (p < 0.5) {
                return 0.5 * pow(2.0*p, g);
            } else {
                return 1.0 - 0.5 * pow(2.0*(1.0 - p), g);
            }
        }

        void main() {

            vec4 fake_frag_coord = u_matrix*vec4(a_position, 1.0);
            fake_frag_coord.xyz /= fake_frag_coord.w;
            fake_frag_coord.w = 1.0/fake_frag_coord.w;

            fake_frag_coord.xyz *= vec3(0.5)+vec3(0.5);
            fake_frag_coord.xy *= u_resolution.xy;

            vec2 st = fake_frag_coord.xy/u_resolution.xy;
            vec2 uv = a_uv;

            vec4 text = texture2D(u_text, uv);
            vec4 norm = u_matrix*vec4(a_normal.xyz, 1.0);
            vec3 position = a_position;

            float t = u_time*PI;
            float noise1 = voronoi2d((st+norm.xy+u_random.xy)*2.0);
            float noise2 = voronoi2d((st+uv.xy+u_random.xz)*6.0);
            float noise3 = voronoi2d((st+norm.xy+u_random.yz)*8.0);

            mat2 rotation = rotate2d(u_index+ease(u_time, 1.5)*PI*2.0);
            float noise = noise1+noise2+noise3;

            float offset = texture2D(u_fft, vec2(u_index/u_length)).x;

            position.xy += ((offset*2.0)-1.0)*0.05;
            position.xy *= rotation;

            v_uv = a_uv;
            v_color = a_color;
            v_normal = vec3(norm.xyz);
            v_depth = position.z;
            v_vertex = (u_matrix*vec4(position, 1.0)).xyz;
            v_barycentric = a_barycentric;

            gl_Position = u_projection*u_view*u_matrix*vec4(position, 1.0);
        }`,

        attributes: {
            a_position: data.positions,
            a_uv: data.uvs,
            a_normal: data.normals,
            a_barycentric: data.barycentric,
            a_color: data.colours
        },

        count: data.positions.length,

        uniforms: {
            u_view: ({time}, props) => {
                return mat4.lookAt([],
                    [0.0, 0.0, 1.5], // position of camera
                    [0.0, 0.0, 0.0], // point of view looking at
                    [0.0, 1.0, 0.0]  // pointing up
                )
            },
            u_matrix: (stats, props) => {
                let { u_time, u_index, u_length, u_random, u_resolution } = props

                let tra = mat4.translate([], mat4.identity([]), [
                    0,
                    0,
                    4+ease(Math.sin(u_time*PI), 1.5)+-1*map(u_index, 0, u_length, 0, u_length*0.75)
                ])
                return mat4.scale([], tra, [1.0, -1.0, 1.0])
            },
            u_projection: ({viewportWidth, viewportHeight}) => {
                return mat4.perspective([],
                    PI/2, viewportWidth/viewportHeight, 0.01, 50)
            },
            u_time: regl.prop('u_time'),
            u_random: regl.prop('u_random'),
            u_resolution: regl.prop('u_resolution'),
            u_position: regl.prop('u_position'),
            u_text: regl.prop('u_text'),
            u_index: regl.prop('u_index'),
            u_length: regl.prop('u_length'),
            u_fft: regl.prop('u_fft'),
            u_biggie: regl.prop('u_biggie')
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

    let image = await load('/assets/BiggieHypnotize.jpg')
    let biggie = regl.texture(image)
    let player = await load_sound(`/assets/2019_08_16.mp3`)
    let fft = new Tone.FFT(N*N)
    let fft_r = new Uint8Array(N*N)
    player.connect(fft)
    player.toMaster()
    player.autostart = true
    player.loop = true

    let torus_elements = new Array(32)
        .fill({})
        .map(function(value, i, a) {
            return {
                u_resolution: [width, height],
                u_random: [rand(), rand(), rand()],
                u_text: text,
                u_index: i,
                u_length: a.length,
                u_biggie: biggie
            }
        })

    let draw_texture_random = [rand(), rand(), rand()]

    return {
        begin() {
            player.restart()
        },
        render({ playhead }) {
            regl.poll()
            regl.clear({color: [...bgc, 1], depth: 1})

            regl.clear({ color: bgc, depth: 1, framebuffer: torus_target1024 })
            regl.clear({ color: bgc, depth: 1, framebuffer: torus_target64 })

            let fft_v = fft.getValue()
            for (let i = 0; i < fft_v.length; ++i) {
                fft_r[i] = Math.floor(map(fft_v[i], -80, 0, 0, 255))
            }
            torus_fft.subimage(fft_r)

            torus_target1024.use(() => {
                torus_draw(torus_elements.map(function(value) {
                    return Object.assign(value, {u_time: playhead, u_fft: torus_fft})
                }))
            })

            torus_target64.use(() => {
                torus_draw(torus_elements.map(function(value) {
                    return Object.assign(value, {u_time: playhead, u_fft: torus_fft})
                }))
            })

            torus_render({
                u_resolution: [width, height],
                u_random: draw_texture_random,
                u_texture0: torus_target1024.color[0],
                u_texture1: torus_target64.color[0],
                u_scale: [2, 2, 2],
                u_time: playhead,
                u_biggie: biggie
            })
        }
    }
}

canvasSketch(sketch, settings)


