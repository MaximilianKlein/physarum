const width = 1000;
const height = 800;
window.onload = function () {
    const canvasEl = document.getElementById("canvas");
    canvasEl.width = width;
    canvasEl.height = height;
    const gl = canvasEl.getContext("webgl2");

    /* #region CREATE SHADER PROGRAMS */
    function createShader(ty, src) {
        const s = gl.createShader(ty);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("Could not compile shader", ty, src, gl.getShaderInfoLog(s));
        }
        return s;
    }
    const vertexShader = createShader(gl.VERTEX_SHADER, "#version 300 es\nin vec2 coord; void main(void) { gl_Position = vec4(coord, 0.0, 1.0); }");
    const fragShaderDisplay = createShader(gl.FRAGMENT_SHADER, document.getElementById("fragment-shader-display").innerText);
    const fragShaderStepper = createShader(gl.FRAGMENT_SHADER, document.getElementById("fragment-shader-stepper").innerText);
    const vertexUpdateShader = createShader(gl.VERTEX_SHADER, document.getElementById("particle-update-vert").innerText);
    const fragDiscardShader = createShader(gl.FRAGMENT_SHADER, document.getElementById("passthru-frag-shader").innerText);
    const vertexRenderShader = createShader(gl.VERTEX_SHADER, document.getElementById("particle-render-vert").innerText);
    const fragVerticesShader = createShader(gl.FRAGMENT_SHADER, document.getElementById("particle-render-frag").innerText);

    function createProgram(vs, fs, transform_feedback_varyings) {
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        if (transform_feedback_varyings != null) {
            gl.transformFeedbackVaryings(p, transform_feedback_varyings, gl.INTERLEAVED_ATTRIBS);
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error("Error linking program", gl.getProgramInfoLog(p));
        }
        return p;
    }
    const vertexUpdateProg = createProgram(vertexUpdateShader, fragDiscardShader, ["v_Position", "v_Velocity"]);
    const vertexRenderProg = createProgram(vertexRenderShader, fragVerticesShader);
    const displayProg = createProgram(vertexShader, fragShaderDisplay);
    const stepperProg = createProgram(vertexShader, fragShaderStepper);
    /* #endregion */

    /* #region GATHER SOME UNIFORMS */
    gl.useProgram(stepperProg);

    const stepperProgImgSize = gl.getUniformLocation(stepperProg, "ImgSize");
    const stepperProgCoordLoc = gl.getAttribLocation(stepperProg, "coord");
    const stepperProgPreviousStateLoc = gl.getUniformLocation(stepperProg, "previousState");

    const displayProgImgSize = gl.getUniformLocation(displayProg, "ImgSize");
    const displayProgCoordLoc = gl.getAttribLocation(displayProg, "coord");
    const displayProgStateLoc = gl.getUniformLocation(displayProg, "state");

    /* #endregion */

    /* #region VERTICES FOR DRAWING TEXTURE  */
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, 1, 1, -1, 1,
    ]), gl.STATIC_DRAW);

    // Note we must bind ARRAY_BUFFER before running vertexAttribPointer!
    // This is confusing and deserves a blog post
    // https://stackoverflow.com/questions/7617668/glvertexattribpointer-needed-everytime-glbindbuffer-is-called
    gl.vertexAttribPointer(stepperProgCoordLoc, 2, gl.FLOAT, false, 0, 0);

    const elementBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([0, 1, 2, 3]), gl.STATIC_DRAW);
    /* #endregion */

    function blackImg(size_x, size_y) {
        var d = [];
        for (var i = 0; i < size_x * size_y; ++i) {
            d.push(0);
            d.push(0);
            d.push(0);
        }
        return new Uint8Array(d);
    }

    const initialImage = blackImg(width, height);

    /* #region CREATE TEXTURES */
    const texture0 = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, initialImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);

    const texture1 = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, texture1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, initialImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);

    const texture2 = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, texture2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, initialImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    /* #endregion */

    /* #region CREATING FRAMEBUFFERS */
    const framebuffers = [gl.createFramebuffer(), gl.createFramebuffer(), gl.createFramebuffer()];

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[0]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture0, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[1]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture1, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[2]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture2, 0);
    /* #endregion */

    /* #region CREATING VERTEX ARRAYS */
    const vaos = [gl.createVertexArray(), gl.createVertexArray()];
    const buffers = [gl.createBuffer(), gl.createBuffer()];

    function initialParticleData(num_parts) {
        var data = [];
        for (var i = 0; i < num_parts; ++i) {
            let x = Math.random();
            let y = Math.random();
            data.push(x);
            data.push(y);
            data.push(-(x - 0.5));
            data.push(-(y - 0.5));
        }
        return data;
    }

    const num_particles = 100000;
    var initial_data =
        new Float32Array(initialParticleData(num_particles));

    gl.bindVertexArray(vaos[0]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[0]);
    gl.bufferData(gl.ARRAY_BUFFER, initial_data, gl.STREAM_DRAW);
    const attribLocationCalc = gl.getAttribLocation(vertexUpdateProg, 'i_Position');
    const attribVelocityCalc = gl.getAttribLocation(vertexUpdateProg, 'i_Velocity');
    gl.enableVertexAttribArray(attribLocationCalc);
    gl.vertexAttribPointer(attribLocationCalc, 2, gl.FLOAT, false, 4 * 4, 0);
    gl.enableVertexAttribArray(attribVelocityCalc);
    gl.vertexAttribPointer(attribVelocityCalc, 2, gl.FLOAT, false, 4 * 4, 8);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.bindVertexArray(vaos[1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[1]);
    gl.bufferData(gl.ARRAY_BUFFER, initial_data, gl.STREAM_DRAW);
    const attribLocationDraw = gl.getAttribLocation(vertexRenderProg, 'i_Position');
    const attribVelocityDraw = gl.getAttribLocation(vertexRenderProg, 'i_Velocity');
    gl.enableVertexAttribArray(attribLocationDraw);
    gl.vertexAttribPointer(attribLocationDraw, 2, gl.FLOAT, false, 4 * 4, 0);
    gl.enableVertexAttribArray(attribVelocityDraw);
    gl.vertexAttribPointer(attribVelocityDraw, 2, gl.FLOAT, false, 4 * 4, 8);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    /* #endregion */


    let cnt = 0;
    function update() {
        const idx1 = cnt % 3;
        const idx2 = (cnt + 1) % 3;
        const idx3 = (cnt + 2) % 3;

        // UPDATE VERTICES
        {
            gl.useProgram(vertexUpdateProg);
            gl.uniform1i(gl.getUniformLocation(vertexUpdateProg, "state"), idx1)

            gl.uniform1f(
                gl.getUniformLocation(vertexUpdateProg, "u_TimeDelta"),
                1.0 / 60.0);


            gl.uniform1f(
                gl.getUniformLocation(vertexUpdateProg, "u_TotalTime"),
                1.0 / 60.0 * cnt);

            gl.uniform1f(
                gl.getUniformLocation(vertexUpdateProg, "u_SensorOffsetDst"),
                parseInt(document.getElementById('sensorOffsetDst').value) / 1000.0);

            gl.uniform1i(
                gl.getUniformLocation(vertexUpdateProg, "u_SensorSize"),
                parseInt(document.getElementById('sensorSize').value));

            gl.uniform1f(
                gl.getUniformLocation(vertexUpdateProg, "u_SensorAngleRad"),
                parseInt(document.getElementById('sensorAngleRad').value) / 100.0);

            gl.uniform1f(
                gl.getUniformLocation(vertexUpdateProg, "u_TurnSpeed"),
                parseInt(document.getElementById('turnSpeed').value) / 10.0);

            gl.uniform2f(
                gl.getUniformLocation(vertexUpdateProg, "u_ImgSize"),
                width, height);

            gl.bindVertexArray(vaos[cnt % 2]);
            gl.bindBufferBase(
                gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffers[(cnt + 1) % 2]);
            gl.enable(gl.RASTERIZER_DISCARD);
            gl.beginTransformFeedback(gl.POINTS);
            gl.drawArrays(gl.POINTS, 0, num_particles);
            gl.endTransformFeedback();
            gl.disable(gl.RASTERIZER_DISCARD);
            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        }
        // DRAW VERTICES
        {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[idx1]);
            gl.bindVertexArray(vaos[cnt % 2]);
            gl.useProgram(vertexRenderProg);
            gl.uniform1i(
                gl.getUniformLocation(vertexRenderProg, "u_SteckMode"),
                document.getElementById('steckmode').checked ? 1 : 0);
            gl.drawArrays(gl.POINTS, 0, num_particles);
            gl.bindVertexArray(null);
        }

        // DIFFUSE PICTURE
        {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[idx2]);
            gl.useProgram(stepperProg);
            gl.enableVertexAttribArray(stepperProgCoordLoc);
            gl.uniform1i(stepperProgPreviousStateLoc, idx1);
            gl.uniform2f(stepperProgImgSize, width, height);
            gl.drawElements(gl.TRIANGLE_FAN, 4, gl.UNSIGNED_BYTE, 0);
        }

        // DRAW FINAL PICTURE
        {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.useProgram(displayProg);
            gl.uniform1i(displayProgStateLoc, idx2)
            gl.uniform2f(displayProgImgSize, width, height);
            gl.drawElements(gl.TRIANGLE_FAN, 4, gl.UNSIGNED_BYTE, 0);
        }

        if (!window.manual) {
            window.requestAnimationFrame(update);
        }
        // DEBUG TRANSFORM FEEDBACK
        {
            // gl.bindBuffer(gl.ARRAY_BUFFER, buffers[(cnt + 1)%2]);
            // var arrBuffer = new Float32Array(initialParticleData(num_particles));
            // gl.getBufferSubData(gl.ARRAY_BUFFER, 0, arrBuffer);
            // gl.bindVertexArray(null);
        }
        cnt++;
    };
    window.requestAnimationFrame(update);
    window.update = update;

    window.manualUpdate = function() {
        window.manual = true;
        update();
    }

    window.automaticUpdate = function() {
        window.manual = false;
        update();
    }
};