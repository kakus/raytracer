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
        // } else if (attribute.get_value() instanceof Array &&
        //            attribute.get_value().every(e => typeof e === 'number')) {
        } else if (attribute.get_value() instanceof Float32Array) {
            let arr: any[] = attribute.get_value();
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;

            for (let idx = 0; idx < arr.length; ++idx) {
                let input = document.createElement('input');
                input.type = 'text';
                input.onchange = () => attribute.alter(v => (v[idx] = parseFloat(input.value), v));
                input.value = arr[idx].toFixed(4);
                input.classList.add('attribute-value');
                widget.append(input);
            }
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
            uniform vec2 u_viewport_size;
            attribute vec3 vertex;
            varying vec4 position;
            void main() {
                vec2 ratio = u_viewport_size / u_viewport_size.x;
                position = vec4(vertex, 1) * vec4(ratio, 1, 1);
                gl_Position = vec4(vertex, 1.);
            }`, 

            /* Fragment */
            
            `
            #define FLT_MAX 3.402e+38
            #define PI 3.14159265359

            precision highp float;

            varying vec4 position;

            uniform float u_time;
            uniform float u_rays_per_pixel;
            uniform vec2  u_viewport_size;
            uniform float u_fov;
            uniform mat4  u_view;
            uniform float u_lens;

            float g_rand_idx = 1.;
            float rand() {
                const float a = 12.9898, b = 78.233, c = 43758.5453;
                float dt = dot( fract(gl_FragCoord.xy * (g_rand_idx += .001)), vec2( a, b ) ), 
                // highp float dt = dot( gl_FragCoord.xy, vec2( a, b ) ), 
                            sn = mod( dt, PI );
                return fract(sin(sn) * c);
            }

            vec2 randv2(float length) {
                return vec2(rand(), rand()) * 2. * length - length;
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

            vec2 rand_point_on_circle() {
                float alpha = rand() * PI;
                return vec2(sin(alpha), cos(alpha));
            }

            struct ray { vec3 ori; vec3 dir; };

            vec3 ray_point(const ray r, float t) {
                return r.ori + t * r.dir;
            }

            struct tmaterial {
                int  type;
                vec3 albedo;
                float fuz; // for metal
            };

            struct hit_result {
                float t; //time
                vec3  p; //point
                vec3  n; //normal
                tmaterial m;
            };

            struct sphere {
                vec3 center; 
                float radius;
                tmaterial material;
            };

            bool sphere_hit(const sphere self, const ray r, float tmin, float tmax, out hit_result hit) {
                vec3 oc = r.ori - self.center;
                float a = dot(r.dir, r.dir);
                float b = 2. * dot(oc, r.dir);
                float c = dot(oc, oc) - self.radius * self.radius;
                float det = b*b - 4.*a*c; 

                bool b_hit = false;
                if (det > 0.) {
                    float tmp = (-b - sqrt(det))/(2.*a);

                    b_hit = tmp > tmin && tmp < tmax || 
                           (tmp = (-b + sqrt(det)) / (2.*a), tmp > tmin && tmp < tmax);

                    if (b_hit) {
                        hit.t = tmp;
                        hit.p = ray_point(r, tmp);
                        hit.n = (hit.p - self.center) / self.radius;
                        hit.m = self.material;
                    }
                }
                return b_hit;
            }

            #define SPHERES_NUM 4
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

            vec3 scatter(inout ray r, const hit_result hit) {
                // lambertian
                if (hit.m.type == 0) {
                    vec3 target = hit.p + hit.n + rand_point_in_sphere();
                    r = ray(hit.p, target - hit.p);
                    return hit.m.albedo;
                }
                // metal
                else if (hit.m.type == 1) {
                    vec3 t = reflect(normalize(r.dir), hit.n);
                    r = ray(hit.p, t + rand_point_in_sphere() * hit.m.fuz);
                    return hit.m.albedo;
                }
                return vec3(0);
            }

            vec3 color(ray r) {
                hit_result hit;
                vec3 attenuation = vec3(1);
                vec3 color = vec3(0);

                for (int i = 0; i < 4; ++i) {
                    if (hit_spheres(r, hit)) {
                        vec3 att = vec3(1);
                        attenuation *= scatter(r, hit);
                    }
                    else {
                        vec3 udir = normalize(r.dir);
                        float t = .5 * (udir.y + 1.);
                        color = mix(vec3(1), vec3(.5,.7,1), t);
                        break;
                    }
                }

                return color * attenuation;
            }

            void main() {
                spheres[0] = sphere(vec3( 0, sin(u_time*.0005), -1), .5, tmaterial(0, vec3(.8, .3, .3), 0.));
                spheres[1] = sphere(vec3(-1, 0, -1),                 .5, tmaterial(1, vec3(.8, .6, .2), 0.5));
                spheres[2] = sphere(vec3( 1, 0, -1),                 .5, tmaterial(1, vec3(.8, .8, .8), 0.));
                spheres[3] = sphere(vec3(0, -100.5, -1),           100., tmaterial(0, vec3(.8, .8,  0), 0.));

                vec2 inv_size = 1. / u_viewport_size;
                vec3 cam_pos = (u_view * vec4(0, 0, 0, 1)).xyz;
                int passes  = int(u_rays_per_pixel);

                float h = 0.5 / tan(radians(u_fov));

                // ray r = ray(cam_pos, vec3(position.xy, -h));
                // gl_FragColor.rgb += color(r);


                for (int i = 0; i < 128; ++i) {
                    if (--passes == 0) break;
                    vec2 lens = rand_point_on_circle() * rand() * u_lens;
                    vec3 lens_p = (u_view * vec4(lens, 0, 0)).xyz;
                    vec4 dir = u_view * vec4(position.xy + randv2(.9) * inv_size, -h, 0);
                    ray r = ray(cam_pos + lens_p, dir.xyz - lens_p);
                    gl_FragColor.rgb += color(r);
                }

                gl_FragColor.rgb /= float(u_rays_per_pixel);
                gl_FragColor.rgb = sqrt(gl_FragColor.rgb);

                // gl_FragColor.xyz = vec3(rand());
                gl_FragColor.a = 1.;
            }`);

        this.shader.set_uniformf('u_viewport_size', [this.canvas.canvas.width, this.canvas.canvas.height]);
        this.canvas.canvas.onmousemove = this.on_mouse_move.bind(this);
        this.canvas.canvas.onmousedown = this.on_mouse_down.bind(this);
        this.canvas.canvas.onmouseup   = this.on_mouse_up.bind(this);
        document.onkeydown = this.on_key_down.bind(this);
        document.onkeyup   = this.on_key_up.bind(this);
    }

    mouse_down = false;
    on_mouse_up(ev: MouseEvent) {
        this.mouse_down = false;
    }
    on_mouse_down(ev: MouseEvent) {
        this.mouse_down = true;
    }
    on_mouse_move(ev: MouseEvent) {
        if (!this.mouse_down) return;

        const sens = .5;
        this.cam_rotation.alter(v => {
            v[1] -= ev.movementX * sens;
            v[0] -= ev.movementY * sens;
            return v;});
    }

    key_down: {[key:string]: boolean} = {};
    on_key_down(ev: KeyboardEvent) {
        this.key_down[ev.key] = true;
    }
    on_key_up(ev: KeyboardEvent) {
        this.key_down[ev.key] = false;
    }

    do_update    = new qu_attribute(true, this);
    rays_per_pixel = new qu_attribute(8, this);
    fov          = new qu_attribute(45, this);
    cam_position = new qu_attribute(vec3.create(), this);
    cam_rotation = new qu_attribute(vec3.create(), this);
    cam_sens     = new qu_attribute(.1, this);
    cam_lens     = new qu_attribute(0.01, this);
    cam_focus_dist = new qu_attribute(1., this);

    app_start_time = Date.now();
    cam_matrix     = mat4.create();
    cam_quat       = quat.create();

    update_camera() {
        let [yaw, pitch, roll] = this.cam_rotation.get_value();
        let cam_rotation = quat.fromEuler(this.cam_quat, yaw, pitch, roll);

        if (this.key_down.w || this.key_down.s) {
            this.cam_position.alter(v => {
                const sens = this.cam_sens.get_value() * (this.key_down.w ? 1 : -1);
                let dir = vec3.fromValues(0, 0, -1);
                vec3.transformQuat(dir, dir, cam_rotation);
                vec3.scale(dir, dir, sens);
                vec3.add(v, v, dir);
                return v;
            });
        }
        if (this.key_down.a || this.key_down.d) {
            this.cam_position.alter(v => {
                const sens = this.cam_sens.get_value() * (this.key_down.d ? 1 : -1);
                let dir = vec3.fromValues(1, 0, 0);
                vec3.transformQuat(dir, dir, cam_rotation);
                vec3.scale(dir, dir, sens);
                vec3.add(v, v, dir);
                return v;
            });
        }
    }

    update() {
        if (this.do_update.get_value()) {
            this.update_camera();

            this.shader.set_uniformf('u_time', [Date.now() - this.app_start_time]);
            this.shader.set_uniformf('u_fov', [this.fov.get_value() / 2.]);
            this.shader.set_uniformf('u_rays_per_pixel', [this.rays_per_pixel.get_value()]);
            this.shader.set_uniformf('u_lens', [this.cam_lens.get_value()]);
            this.shader.set_uniformf('u_view',
                mat4.fromRotationTranslationScale(this.cam_matrix, 
                    this.cam_quat, 
                    this.cam_position.get_value(),
                    vec3.fromValues(this.cam_focus_dist.get_value())));

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