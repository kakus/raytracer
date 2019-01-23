/// <reference path="utils/utils.ts" />
/// <reference path="types/WebGLTypes.d.ts" />
/// <reference path="math/mat4.ts" />
/// <reference path="math/vec4.ts" />
/// <reference path="math/quat.ts" />
/// <reference path="core/mesh.ts" />
/// <reference path="loaders/obj-loader.ts" />



class qu_delegate {
    private listeners: Function[] = [];
    bind(callback: Function) {
        this.listeners.push(callback);
    }
    broadcast(...payload: any) {
        for (let listener of this.listeners) {
            listener(...payload);
        }
    }
}

class qu_attribute<T> {
    static attribute_list: qu_attribute<any>[] = [];
    static on_new_attribute_event: Function;

    public on_attribute_change_delegate = new qu_delegate();

    constructor(
        private value: T,
        private outer: any
    ) {
        qu_attribute.attribute_list.push(this);
        if (qu_attribute.on_new_attribute_event) {
            setTimeout(qu_attribute.on_new_attribute_event.bind(undefined, this), 0);
        }
    }

    get_value() { 
        return this.value;
    }
    set_value(in_value: T) { 
        this.value = in_value; 
        this.on_attribute_change_delegate.broadcast(this); 
        return this.value;
     }
    alter(fn: (val: T) => T) {
        return this.set_value(fn(this.value));
    }
    get_outer() { return this.outer; }
    get_name() {
        let outer_name = this.outer.constructor.name;
        for (let prop in this.outer) {
            if (this.outer[prop] === this) return `${outer_name}.${prop}`;
        }
        return `${outer_name}.unknow`;
    }
}

class qu_debug_explorer {

    root: HTMLDivElement;

    constructor() {
        this.root = document.createElement('div');
        this.root.classList.add('debug-root');
        document.body.append(this.root);
        qu_attribute.on_new_attribute_event = this.on_new_attribute.bind(this);
    }
    
    on_new_attribute(attribute: qu_attribute<any>) {
        let widget = document.createElement('div');
        widget.classList.add('debug-attribute');
        this.root.append(widget);
        attribute.on_attribute_change_delegate.bind(
            this.on_attribute_changed.bind(this, widget));
        this.on_attribute_changed(widget, attribute);
    }

    on_attribute_changed(widget: HTMLDivElement, attribute: qu_attribute<any>) {
        if (typeof attribute.get_value() === 'boolean') {
            let input = document.createElement('input');
            input.type = 'checkbox';
            input.onchange = () => attribute.set_value(input.checked);
            input.checked = attribute.get_value();
            input.classList.add('attribute-value');
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;
            widget.append(input);
        } else if (typeof attribute.get_value() === 'number') {
            let val = attribute.get_value();
            let is_int = Number.isInteger(val);
            let input = document.createElement('input');
            input.type = 'text';
            input.onchange = () => attribute.set_value(parseFloat(input.value));
            input.value = is_int ? val.toString() : val.toFixed(3);
            input.classList.add('attribute-value');
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;
            widget.append(input);
        } else if (typeof attribute.get_value() === 'string') {
            let input = document.createElement('input');
            input.type = 'text';
            input.onchange = () => attribute.set_value(input.value);
            input.value = attribute.get_value();
            input.classList.add('attribute-value');
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;
            widget.append(input);
        } else {
            widget.innerText = 
                `${attribute.get_name()}: ${attribute.get_value()}`;
        }
    }
}





class qr_webgl_canvas {

    canvas: HTMLCanvasElement;
    gl: WebGLRenderingContext;

    constructor(canvas_id: string) {
        this.canvas = document.querySelector(canvas_id);
        this.gl     = this.canvas.getContext('webgl');

        this.gl.enable(egl.DEPTH_TEST);
    }

    public make_shader(vertex: string, fragment: string) {
        let gl = this.gl;

        let compile = (type, source) => {
            let shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(`compile_error: ${gl.getShaderInfoLog(shader)}`);
            }
            return shader;
        }

        let program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`link error: ${gl.getProgramInfoLog(program)}`);
        }

        return new qr_webgl_shader(gl, program);
    }

    clear() {
        this.gl.clear(egl.COLOR_BUFFER_BIT | egl.DEPTH_BUFFER_BIT);
    }
}

class qc_app {
    canvas: qr_webgl_canvas;
    shader: qr_webgl_shader;
    debug_widget = new qu_debug_explorer();
    quad: qr_webgl_mesh = qr_webgl_mesh.make_quad();

    init() {
        this.canvas = new qr_webgl_canvas('#canvas');
        // document.body.appendChild(this.canvas.canvas);

        this.shader = this.canvas.make_shader(`
            uniform mat4 projection;
            uniform mat4 view;
            uniform mat4 model;

            attribute vec3 vertex;
            varying vec4 position;
            void main() {
                position = vec4(vertex, 1) * vec4(2, 1, 1, 1);
                gl_Position = vec4(vertex, 1.);
            }`, 

            /* Fragment */
            
            `
            #define FLT_MAX 3.402e+38
            #define PI 3.14159265359

            precision highp float;

            uniform float u_time;
            uniform float u_rays_per_pixel;
            uniform vec2  u_viewport_size;

            float g_rand_idx = 1.;
            highp float rand() {
                const highp float a = 12.9898, b = 78.233, c = 43758.5453;
                highp float dt = dot( fract(gl_FragCoord.xy * (g_rand_idx += .001)), vec2( a, b ) ), 
                // highp float dt = dot( gl_FragCoord.xy, vec2( a, b ) ), 
                            sn = mod( dt, PI );
                return fract(sin(sn) * c);
            }

            vec3 randv3(float length) {
                return vec3(rand(), rand(), rand()) * 2. * length - length;
            }

            vec3 rand_point_in_sphere() {
                // vec3 r = randv3(1.);
                // return normalize(r) * pow(rand(), 1./3.);
                return normalize(randv3(1.));
                // return randv3(.5);
            }

            struct ray { vec3 ori; vec3 dir; };

            vec3 ray_point(const ray r, float t) {
                return r.ori + t * r.dir;
            }

            struct hit_result {
                float t; //time
                vec3  p; //point
                vec3  n; //normal
            };

            struct sphere {
                vec3 center; 
                float radius;
            };

            bool sphere_hit(const sphere self, const ray r, float tmin, float tmax, out hit_result hit) {
                vec3 oc = r.ori - self.center;
                float a = dot(r.dir, r.dir);
                float b = 2. * dot(oc, r.dir);
                float c = dot(oc, oc) - self.radius * self.radius;
                float det = b*b - 4.*a*c; 

                if (det > 0.) {
                    float tmp = (-b - sqrt(det))/(2.*a);
                    if (tmp > tmin && tmp < tmax) {
                        hit.t = tmp;
                        hit.p = ray_point(r, tmp);
                        hit.n = (hit.p - self.center) / self.radius;
                        return true;
                    }
                    tmp = (-b + sqrt(det))/(2.*a);
                    if (tmp > tmin && tmp < tmax) {
                        hit.t = tmp;
                        hit.p = ray_point(r, tmp);
                        hit.n = (hit.p - self.center) / self.radius;
                        return true;
                    }
                }
                return false;
            }

            #define SPHERES_NUM 2
            sphere spheres[SPHERES_NUM];

            bool hit_spheres(const ray r, out hit_result res) {
                hit_result hit;
                bool b_hit = false;
                float t_min = 0.001;
                float t_max = FLT_MAX;

                for (int i = 0; i < SPHERES_NUM; ++i) {
                    if (sphere_hit(spheres[i], r, t_min, t_max, hit)) {
                        t_max = hit.t;
                        res   = hit;
                        b_hit = true;
                    }
                }

                return b_hit;
            }

            vec3 color(ray r) {
                hit_result hit;
                vec4       color = vec4(0, 0, 0, 1);

                for (int i = 0; i < 4; ++i) {
                    if (hit_spheres(r, hit)) {
                        vec3 target = hit.p + hit.n + rand_point_in_sphere();
                        r = ray(hit.p, target - hit.p);
                        color.a *= .5;
                    }
                    else {
                        vec3 udir = normalize(r.dir);
                        float t = .5 * (udir.y + 1.);
                        color.rgb = mix(vec3(1), vec3(.5,.7,1), t);
                        break;
                    }
                }

                return color.rgb * color.a;
            }

            vec2 randv(float min, float max) {
                return vec2(rand(), rand()) * (max - min) + min;
            }

            varying vec4 position;
            void main() {
                spheres[0] = sphere(vec3(0, sin(u_time*.0005), -1), .5);
                spheres[1] = sphere(vec3(0, -100.5, -1), 100.);

                vec2 size = vec2(400, 200);
                vec3 cam_pos = vec3(0);
                int passes  = int(u_rays_per_pixel);


                ray r = ray(cam_pos, vec3(position.xy, -1));
                gl_FragColor.rgb += color(r);

                for (int i = 1; i < 128; ++i) {
                    if (--passes == 0) break;
                    ray r = ray(cam_pos, vec3(position.xy + randv(-1.5, 1.5) / size, -1));
                    gl_FragColor.rgb += color(r);
                }

                gl_FragColor.rgb /= float(u_rays_per_pixel);
                gl_FragColor.rgb = sqrt(gl_FragColor.rgb);

                // gl_FragColor.xyz = vec3(rand());
                gl_FragColor.a = 1.;
            }`);

        this.shader.set_uniformf('u_viewport_size', [this.canvas.canvas.width, this.canvas.canvas.height]);
    }

    do_update = new qu_attribute(true, this);
    rays_per_pixel = new qu_attribute(8, this);
    app_start_time = Date.now();

    update() {
        if (this.do_update.get_value()) {
            this.shader.set_uniformf('u_time', [Date.now() - this.app_start_time]);
            this.shader.set_uniformf('u_rays_per_pixel', [this.rays_per_pixel.get_value()]);
            this.render();
        }
        requestAnimationFrame(this.update.bind(this));
    }

    draw_lines = new qu_attribute(false, this);

    render() {
        this.canvas.clear();
        this.shader.draw_mesh(
            this.quad,
            this.draw_lines.get_value() ? 'lines' : 'triangles');
    }

    loop() {
        requestAnimationFrame(this.update.bind(this));
    }
}

let app = new qc_app();
app.init();
app.loop();