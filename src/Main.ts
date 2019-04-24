/// <reference path="utils/utils.ts" />
/// <reference path="types/WebGLTypes.d.ts" />
/// <reference path="math/mat4.ts" />
/// <reference path="math/vec4.ts" />
/// <reference path="math/quat.ts" />
/// <reference path="core/mesh.ts" />
/// <reference path="core/texture.ts" />

/// <reference path="loaders/obj-loader.ts" />


class qu_delegate_handle<T extends Function> {
    constructor(
        public fn_: T,
        public event_: qu_multicast_event<T>
    ) { }
    unbind() {
        this.event_.remove(this);
        this.event_ = undefined;
        this.fn_ = undefined;
    }
}
class qu_multicast_event<TDelegate extends Function = () => void> {
    private listeners: TDelegate[] = [];
    bind(callback: TDelegate) {
        this.listeners.push(callback);
        return new qu_delegate_handle(callback, this);
    }
    remove(handle: qu_delegate_handle<TDelegate>) {
        this.listeners.splice(this.listeners.indexOf(handle.fn_), 1);        
    }
    broadcast(...payload: any) {
        for (let listener of this.listeners) {
            (<any>listener)(...payload);
        }
    }
}

function qu_make_attr<T>(val: T | T[], outer: any, default_ctor?: new () => T) {
    if (val instanceof Array) {
        return new qu_array_attribute(val, outer, default_ctor);
    } else {
        return new qu_attribute(val, outer, default_ctor)
    }
}

class qu_attribute<T> {
    // all attributes, also arrays
    static g_list: qu_attribute<any>[] = [];
    static g_array_list: qu_array_attribute<any>[] = [];
    static on_new_attribute_delegate: Function;

    public on_value_change_event = new qu_multicast_event<(attr: this) => void>();

    constructor(
        private value_: T,
        private outer: any,
        private default_ctor?: new () => T
    ) {
        qu_attribute.g_list.push(this);

        // for (let array of qu_attribute.g_array_list) {
        //     let idx = array.value.findIndex(e => e === outer);
        //     if (idx >= 0) {
        //         array.childs.splice(idx, 0, this);
        //     }
        // }

        if (qu_attribute.on_new_attribute_delegate) {
            setTimeout(() => qu_attribute.on_new_attribute_delegate(this), 0);
        }
    }

    new_default(): T {
        return new this.default_ctor();
    }

    get_value() { 
        return this.value_;
    }
    get value() {
        return this.value_;
    }

    set_value(in_value: T) { 
        this.value_ = in_value; 
        this.on_value_change_event.broadcast(this); 
        return this.value_;
     }
    set value(in_value: T)  {
        this.set_value(in_value);
    }

    alter(fn: (val: T) => T) {
        return this.set_value(fn(this.value_));
    }

    get_outer() { 
        return this.outer;
    }

    get_name() {
        let outer_name = this.outer.constructor.name;
        for (let prop in this.outer) {
            if (this.outer[prop] === this) return `${outer_name}.${prop}`;
        }
        return `${outer_name}.unknow`;
    }
}

class qu_array_attribute<T> extends qu_attribute<T[]> {
    childs: qu_attribute<any>[] = [];
    constructor(value_: T[], outer: any, private element_default_ctor?: new () => T) {
        super(value_, outer);

        for (let attr of qu_attribute.g_list) {
            if (value_.find(e => e === attr.get_outer())) {
                this.childs.push(attr);
            }
        }
    }
    new_default_element(): T {
        return new this.element_default_ctor();
    } 
}

class qu_debug_explorer {

    root: HTMLDivElement;
    attr_widget_list: HTMLDivElement[] = [];
    attr_delegate_list: qu_delegate_handle<any>[] = [];

    constructor() {
        this.root = document.createElement('div');
        this.root.classList.add('debug-root');
        document.body.append(this.root);
        qu_attribute.on_new_attribute_delegate = this.on_new_attribute.bind(this);
    }

    get_parent_widget(attribute: qu_attribute<any>) {
        let parentIdx = qu_attribute.g_list.findIndex(attr => {
            let val = attr.value;
            if (val instanceof Array) {
                return val.find(e => e === attribute.get_outer());
            } 
            return false;
        });
        return this.attr_widget_list[parentIdx];
    }

    on_new_attribute(attribute: qu_attribute<any>) {
        let widget = this.create_attribute_widget(attribute, this.get_parent_widget(attribute));

        if (attribute.value instanceof Array) {
            let childs = [];
            for (let g_idx = 0; g_idx < qu_attribute.g_list.length; ++g_idx) {
                let attr = qu_attribute.g_list[g_idx];
                let attr_idx = attribute.value.findIndex(e => e === attr.get_outer());
                if (attr_idx >= 0) {
                    childs.push(g_idx);
                }
            }

            let non_child = widget.nextSibling;
            for (let g_idx of childs.sort()) {
                let child_widget = this.attr_widget_list[g_idx];
                if (child_widget) {
                    this.root.insertBefore(child_widget, non_child);
                    child_widget.classList.add('array-element');
                    non_child = child_widget.nextSibling;
                }
            }
        }
    }

    create_attribute_widget(attribute: qu_attribute<any>, parent?: HTMLDivElement) {
        let widget = document.createElement('div');

        widget.classList.add('debug-attribute');
        if (parent) {
            let non_array_attr = parent.nextElementSibling;
            while (non_array_attr.classList.contains('array-element')) { 
                non_array_attr = non_array_attr.nextElementSibling;
            }
            this.root.insertBefore(widget, non_array_attr);
            widget.classList.add('array-element');
        } else {
            this.root.append(widget);
        }

        let handle = attribute.on_value_change_event.bind(
            this.on_attribute_changed.bind(this, widget));

        this.attr_delegate_list.push(handle);
        this.attr_widget_list.push(widget);
        this.on_attribute_changed(widget, attribute);
        return widget;
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
        } else if (attribute instanceof qu_array_attribute) {
            let button = document.createElement('input');
            button.type = 'button';
            button.value = `+`;
            button.classList.add('attribute-value');
            button.onclick = () => attribute.alter(v => (v.push(attribute.new_default_element()), v));
            widget.innerHTML = `<div class='attribute-name'>${attribute.get_name()}</div>`;
            widget.append(button);
        } else {
            widget.innerText = 
                `${attribute.get_name()}: ${attribute.get_value()}`;
        }
    }
}

function create_canvas(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    let canvas = document.createElement('canvas');
    let ctx    = canvas.getContext('2d');
    canvas.width  = width;
    canvas.height = height;
    paint(ctx);
    return canvas;
}

function checkboard(width = 64, height = 64, rect = 4) {
    return create_canvas(width, height, ctx => {
        for (let x = 0; x < width; x += rect) {
            for (let y = 0; y < height; y += rect) {
                ctx.fillStyle = ((x + y) / rect) % 2 ? '#f00' : '#000';
                ctx.fillRect(x, y, rect, rect);
            }
        }
    });
}



class qr_webgl_viewport {

    canvas: HTMLCanvasElement;
    gl: WebGLRenderingContext;

    constructor(canvas_id: string) {
        this.canvas = document.querySelector(canvas_id);
        this.gl     = this.canvas.getContext('webgl');

        // this.gl.enable(egl.DEPTH_TEST);
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

class qu_sphere {
    pos    = new qu_attribute(vec3.create(), this);
    radius = new qu_attribute(1., this);

    constructor([x, y, z] = [0, 0, 0], in_radious = 1.) {
        this.pos.set_value(vec3.fromValues(x, y, z));
        this.radius.set_value(in_radious);
    }
}

let debug_widget = new qu_debug_explorer();

class qc_app {
    webgl_viewport: qr_webgl_viewport;
    raytracer_shader: qr_webgl_shader;
    quad: qr_webgl_mesh = qr_webgl_mesh.make_quad();
    texture_shader: qr_webgl_shader;
    texture0: qu_texture;
    texture1: qu_texture;
    //spheres = new qu_array_attribute([new qu_sphere()], this, qu_sphere);

    init() {
        this.webgl_viewport = new qr_webgl_viewport('#canvas');
        // document.body.appendChild(this.canvas.canvas);
        this.texture_shader = this.webgl_viewport.make_shader(`
            attribute vec3 vertex;
            varying vec2 position;
            void main() {
                position = vertex.xy;
                gl_Position =  vec4(vertex, 1.);
            }`, `
            precision lowp float;
            uniform sampler2D tex;
            varying vec2 position;
            void main() {
                gl_FragColor = texture2D(tex, (position + 1.) * .5);
            }`);
        // use texture from register 0
        this.texture_shader.set_uniformi('tex', 0);
            
        this.raytracer_shader = this.webgl_viewport.make_shader(`
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

            uniform float u_frame;
            uniform float u_time;
            uniform float u_rays_per_pixel;
            uniform vec2  u_viewport_size;
            uniform float u_fov;
            uniform mat4  u_view;
            uniform float u_lens;

            uniform sampler2D u_prev;

            float g_rand_idx = 1.;
            float rand() {
                const float a = 12.9898, b = 78.233, c = 43758.5453;
                float dt = dot( fract(gl_FragCoord.xy * (g_rand_idx += .001) + (u_time/1000.)), vec2( a, b ) ), 
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

            float schlick(float cosine, float ref_idx) {
                float r0 = (1. - ref_idx) / (1. + ref_idx);
                r0 = r0 * r0;
                return r0 + (1. - r0) * pow(1. - cosine, 5.);
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
                // diaelectric (glass)
                else if (hit.m.type == 2) {
                    vec3 n = hit.n;
                    const float ref_idx = 1.45;
                    float ni = 1. / ref_idx;
                    float hit_dot = dot(r.dir, hit.n);
                    float cosine = -hit_dot / length(r.dir);

                    if (hit_dot > 0.) {
                        n = -n;
                        ni = 1. / ni;
                        cosine *= -ref_idx;
                    }

                    vec3 refracted = refract(r.dir, n, ni);
                    if (dot(refracted, refracted) != 0.) {
                        if (rand() > schlick(cosine, ref_idx)) {
                            r = ray(hit.p, refracted);
                            return hit.m.albedo;
                        }
                    }

                    r = ray(hit.p, reflect(normalize(r.dir), hit.n));
                    return hit.m.albedo;
                }
                return vec3(0);
            }

            bool my_refract(inout vec3 v, const vec3 n, const float ni_over_nt) {
                vec3 uv = normalize(v);
                float dt = dot(uv, n);
                float discriminant = 1. - ni_over_nt * ni_over_nt * (1. - dt * dt);
                if (discriminant > 0.) {
                    v = ni_over_nt * (uv - n * dt) - n * sqrt(discriminant);
                    return true;
                }
                return false;
            }

            vec3 color(ray r) {
                hit_result hit;
                vec3 attenuation = vec3(1);
                vec3 color = vec3(0);

                for (int i = 0; i < 8; ++i) {
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
                spheres[0] = sphere(vec3( 0, 0, 0), .5, tmaterial(0, vec3(.8, .3, .3), 0.));
                spheres[1] = sphere(vec3(-1.1, 0, 0),                 .5, tmaterial(2, vec3(1., 1., 1.), 0.5));
                spheres[2] = sphere(vec3( 1.1, 0, 0),                 .5, tmaterial(1, vec3(.8, .8, .8), 0.));
                spheres[3] = sphere(vec3(0, -100.5, 0),           100., tmaterial(0, vec3(.8, .8,  0), 0.));

                vec2 inv_size = 1. / u_viewport_size;
                vec3 cam_pos = (u_view * vec4(0, 0, 0, 1)).xyz;
                int passes  = int(u_rays_per_pixel);

                float h = 0.5 / tan(radians(u_fov));

                for (int i = 0; i < 128; ++i) {
                    vec2 lens = rand_point_on_circle() * rand() * u_lens;
                    vec3 lens_p = (u_view * vec4(lens, 0, 0)).xyz;
                    vec4 dir = u_view * vec4(position.xy + randv2(.9) * inv_size, -h, 0);
                    ray r = ray(cam_pos + lens_p, dir.xyz - lens_p);
                    gl_FragColor.rgb += color(r);
                    if (--passes == 0) {
                        gl_FragColor.rgb /= u_rays_per_pixel;
                        break;
                    }
                    if (u_frame > 1.) {
                        break;
                    }
                }

                if (u_frame > 1.) {
                    gl_FragColor.rgb /= u_frame;
                    gl_FragColor.rgb += (u_frame - 1.) * texture2D(u_prev, gl_FragCoord.xy/u_viewport_size).rgb / u_frame;
                }

                // gl_FragColor.rgb /= float(u_rays_per_pixel);
                // gl_FragColor.rgb = sqrt(gl_FragColor.rgb);
                // gl_FragColor.xyz += vec3(rand(), rand(), rand());
                gl_FragColor.a = 1.;
            }`);

        // use texture from register 0
        this.raytracer_shader.set_uniformi('u_prev', 0);

        const canvas = this.webgl_viewport.canvas;

        canvas.onmousemove = this.on_mouse_move.bind(this);
        canvas.onmousedown = this.on_mouse_down.bind(this);
        canvas.onmouseup   = this.on_mouse_up.bind(this);
        canvas.ontouchstart= this.on_touch_start.bind(this);
        // canvas.ontouchend  = this.on_touch_end.bind(this);
        canvas.ontouchmove = this.on_touch_move.bind(this);
        document.onkeydown = this.on_key_down.bind(this);
        document.onkeyup   = this.on_key_up.bind(this);

        for (let attr of qu_attribute.g_list) {
            if (attr != this.frame_idx) {
                attr.on_value_change_event.bind(() => this.frame_idx.value = 0);
            }
        }

        this.on_resize();
        this.viewport_size.on_value_change_event.bind(this.on_resize.bind(this));
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

    last_touch_pos = [0, 0];
    on_touch_start(ev: TouchEvent) {
        this.last_touch_pos = [ev.touches[0].clientX, ev.touches[0].clientY];
    }
    on_touch_move(ev: TouchEvent) {
        let x = ev.touches[0].clientX,
            y = ev.touches[0].clientY;

        this.cam_rotation.alter(v => {
            v[1] -= x - this.last_touch_pos[0];
            v[0] -= y - this.last_touch_pos[1];
            return v;
        });

        this.last_touch_pos = [x, y];
        ev.preventDefault();
    }

    key_down: {[key:string]: boolean} = {};
    on_key_down(ev: KeyboardEvent) {
        this.key_down[ev.key] = true;
    }
    on_key_up(ev: KeyboardEvent) {
        this.key_down[ev.key] = false;
    }

    viewport_size= new qu_attribute(vec3.fromValues(256, 128, 1), this);
    do_update    = new qu_attribute(true, this);
    rays_per_pixel = new qu_attribute(1, this);
    fov          = new qu_attribute(45, this);
    cam_position = new qu_attribute(vec3.fromValues(0, 0, 1), this);
    cam_rotation = new qu_attribute(vec3.create(), this);
    cam_sens     = new qu_attribute(.1, this);
    cam_lens     = new qu_attribute(0., this);
    cam_focus_dist = new qu_attribute(1., this);
    cam_orbit    = new qu_attribute(false, this);
    frame_idx      = new qu_attribute(0, this);

    app_start_time = Date.now();
    cam_matrix     = mat4.create();
    cam_quat       = quat.create();

    on_resize() {
        const canvas = this.webgl_viewport.canvas;
        let [width, height, scale] = this.viewport_size.value;
        width  = canvas.width  = width * scale;
        height = canvas.height = height * scale;
        this.webgl_viewport.gl.viewport(0, 0, width, height);
        this.raytracer_shader.set_uniformf('u_viewport_size', [width, height]);
        this.texture0 = new qu_texture(this.webgl_viewport.gl, width, height, {wrap: egl.CLAMP_TO_EDGE});
        this.texture1 = new qu_texture(this.webgl_viewport.gl, width, height, {wrap: egl.CLAMP_TO_EDGE}); 
    }

    update_camera() {
        let [yaw, pitch, roll] = this.cam_rotation.get_value();
        let cam_rotation = quat.fromEuler(this.cam_quat, yaw, pitch, roll);

        if (this.cam_orbit.get_value()) {
            this.cam_position.alter(v => {
                vec3.rotateY(v, v, vec3.create(), 0.01);
                return v;
            })
            this.cam_rotation.alter(v => {
                let p = this.cam_position.value;
                v[1] = Math.atan2(p[0], p[2]) * (180.0/Math.PI);
                return v;
            })
            return;
        }

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
        if (this.do_update.value) {
            this.update_camera();
            this.frame_idx.value += 1;

            this.raytracer_shader.set_uniformf('u_frame', [this.frame_idx.value]);
            this.raytracer_shader.set_uniformf('u_time', [Date.now() - this.app_start_time]);
            this.raytracer_shader.set_uniformf('u_fov', [this.fov.get_value() / 2.]);
            this.raytracer_shader.set_uniformf('u_rays_per_pixel', [this.rays_per_pixel.get_value()]);
            this.raytracer_shader.set_uniformf('u_lens', [this.cam_lens.get_value()]);
            this.raytracer_shader.set_uniformf('u_view',
                mat4.fromRotationTranslationScale(this.cam_matrix, 
                    this.cam_quat, 
                    this.cam_position.get_value(),
                    vec3.fromValues(this.cam_focus_dist.get_value())));

            if (this.frame_idx.value < 400) {
                this.render();
            }
        }
        requestAnimationFrame(this.update.bind(this));
    }

    flip = false;
    render() {
        // this.canvas.clear();
        let prev = this.flip ? this.texture0 : this.texture1;
        let next = this.flip ? this.texture1 : this.texture0; 
        this.flip = !this.flip;

        prev.bind();
        next.paint(() => {
            this.raytracer_shader.draw_mesh(this.quad, 'triangles');
        })

        next.bind();
        this.texture_shader.draw_mesh(this.quad, 'triangles');
    }

    loop() {
        requestAnimationFrame(this.update.bind(this));
    }
}

let app = new qc_app();
app.init();
app.loop();