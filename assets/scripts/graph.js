var numNodes = 100;
var numLinks = 10;
var numActiveNodes = 10;
var nodeColor = 0xff00ff; // hex rrggbb
var nodeSize = 32;

var graph, layout, renderer, processingElement, container;

function getRand() {
  return 1 + Math.floor(Math.random() * numNodes);
}

function addLinks() {
  for (var i = 1; i <= numNodes; i++) {

    graph.addNode(i);
    /*if (i === 1) {
      graph.addLink(1, numNodes);
    } else {
      graph.addLink(i, i - 1);
    }*/
  }

  for (var i = 1; i <= numActiveNodes; i++) {
    var from = i;

    for (var j = 1; j <= numLinks; j++) {

      var to = getRand();
      if (from !== to) {
        graph.addLink(j, to);
      }
    }

  }
}

function precompute(iterations, callback) {
  // let's run 10 iterations per event loop cycle:
  var i = 0;
  while (iterations > 0 && i < 10) {
    layout.step();
    iterations--;
    i++;
  }
  processingElement.innerHTML = 'Layout precompute: ' + iterations;
  if (iterations > 0) {
    setTimeout(function () {
        precompute(iterations, callback);
    }, 0); // keep going in next even cycle
  } else {
    // we are done!
    callback();
  }
}

function onLoad() {

  processingElement = document.getElementById('log');
  container = document.getElementById('graph-container');

  graph = Viva.Graph.graph();

  layout = Viva.Graph.Layout.forceDirected(graph, {
    springLength : 100,
    springCoeff : 0.0001,
    dragCoeff : 0.05,
    gravity : -1.5,
    theta : 1
  });

  addLinks();

  // we need to compute layout, but we don't want to freeze the browser
  precompute(1000, renderGraph);

  $('#reset').click(function () {
    renderer.reset()
  });

}

function renderGraph() {
  var graphics = Viva.Graph.View.webglGraphics();

  // Step 4. Customize link appearance:
  //   As you might have guessed already the link()/placeLink()
  //   functions complement the node()/placeNode() functions
  //   and let us override default presentation of edges:
  /*graphics.link(function(link){
    return Viva.Graph.svg('path')
      .attr('stroke', 'yellow')
      .attr('stroke-dasharray', '5, 5');
  }).placeLink(function(linkUI, fromPos, toPos) {
    // linkUI - is the object returend from link() callback above.
    var data = 'M' + fromPos.x + ',' + fromPos.y +
               'L' + toPos.x + ',' + toPos.y;

    // 'Path data' (http://www.w3.org/TR/SVG/paths.html#DAttribute )
    // is a common way of rendering paths in SVG:
    linkUI.attr('d', data);
  });*/

  // first, tell webgl graphics we want to use custom shader
  // to render nodes:
  var circleNode = buildCircleNodeShader();
  graphics.setNodeProgram(circleNode);

  // second, change the node ui model, which can be understood
  // by the custom shader:
  graphics.node(function(node) {
    return new WebglCircle(nodeSize, nodeColor);
  });



  renderer = Viva.Graph.View.renderer(graph, {
    graphics: graphics,
    layout: layout,
    container: container
  });
  renderer.run();

  // Final bit: most likely graph will take more space than available
  // screen. Let's zoom out to fit it into the view:
  var graphRect = layout.getGraphRect();
  var graphSize = Math.min(graphRect.x2 - graphRect.x1, graphRect.y2 - graphRect.y1);
  var screenSize = Math.min(document.body.clientWidth, document.body.clientHeight);

  var desiredScale = screenSize / graphSize;
  zoomOut(desiredScale, 1);

  function zoomOut(desiredScale, currentScale) {
    // zoom API in vivagraph 0.5.x is silly. There is no way to pass transform
    // directly. Maybe it will be fixed in future, for now this is the best I could do:
    if (desiredScale < currentScale) {
      currentScale = renderer.zoomOut();
      setTimeout(function () {
        zoomOut(desiredScale, currentScale);
      }, 1);
    } else {
      // renderer.pause();
    }
  }

}

// Lets start from the easiest part - model object for node ui in webgl
function WebglCircle(size, color) {
  this.size = size;
  this.color = color;
}

// Next comes the hard part - implementation of API for custom shader
// program, used by webgl renderer:
function buildCircleNodeShader() {
  // For each primitive we need 4 attributes: x, y, color and size.
  var ATTRIBUTES_PER_PRIMITIVE = 4,
      nodesFS = [
      'precision mediump float;',
      'varying vec4 color;',

      'void main(void) {',
      '   if ((gl_PointCoord.x - 0.5) * (gl_PointCoord.x - 0.5) + (gl_PointCoord.y - 0.5) * (gl_PointCoord.y - 0.5) < 0.25) {',
      '     gl_FragColor = color;',
      '   } else {',
      '     gl_FragColor = vec4(0);',
      '   }',
      '}'].join('\n'),
      nodesVS = [
      'attribute vec2 a_vertexPos;',
      // Pack color and size into vector. First elemnt is color, second - size.
      // Since it's floating point we can only use 24 bit to pack colors...
      // thus alpha channel is dropped, and is always assumed to be 1.
      'attribute vec2 a_customAttributes;',
      'uniform vec2 u_screenSize;',
      'uniform mat4 u_transform;',
      'varying vec4 color;',

      'void main(void) {',
      '   gl_Position = u_transform * vec4(a_vertexPos/u_screenSize, 0, 1);',
      '   gl_PointSize = a_customAttributes[1] * u_transform[0][0];',
      '   float c = a_customAttributes[0];',
      '   color.b = mod(c, 256.0); c = floor(c/256.0);',
      '   color.g = mod(c, 256.0); c = floor(c/256.0);',
      '   color.r = mod(c, 256.0); c = floor(c/256.0); color /= 255.0;',
      '   color.a = 1.0;',
      '}'].join('\n');

  var program,
      gl,
      buffer,
      locations,
      utils,
      nodes = new Float32Array(64),
      nodesCount = 0,
      canvasWidth, canvasHeight, transform,
      isCanvasDirty;

  return {
      /**
       * Called by webgl renderer to load the shader into gl context.
       */
      load : function (glContext) {
          gl = glContext;
          webglUtils = Viva.Graph.webgl(glContext);

          program = webglUtils.createProgram(nodesVS, nodesFS);
          gl.useProgram(program);
          locations = webglUtils.getLocations(program, ['a_vertexPos', 'a_customAttributes', 'u_screenSize', 'u_transform']);

          gl.enableVertexAttribArray(locations.vertexPos);
          gl.enableVertexAttribArray(locations.customAttributes);

          buffer = gl.createBuffer();
      },

      /**
       * Called by webgl renderer to update node position in the buffer array
       *
       * @param nodeUI - data model for the rendered node (WebGLCircle in this case)
       * @param pos - {x, y} coordinates of the node.
       */
      position : function (nodeUI, pos) {
          var idx = nodeUI.id;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE] = pos.x;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 1] = -pos.y;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 2] = nodeUI.color;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 3] = nodeUI.size;
      },

      /**
       * Request from webgl renderer to actually draw our stuff into the
       * gl context. This is the core of our shader.
       */
      render : function() {
          gl.useProgram(program);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.DYNAMIC_DRAW);

          if (isCanvasDirty) {
              isCanvasDirty = false;
              gl.uniformMatrix4fv(locations.transform, false, transform);
              gl.uniform2f(locations.screenSize, canvasWidth, canvasHeight);
          }

          gl.vertexAttribPointer(locations.vertexPos, 2, gl.FLOAT, false, ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT, 0);
          gl.vertexAttribPointer(locations.customAttributes, 2, gl.FLOAT, false, ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT, 2 * 4);

          gl.drawArrays(gl.POINTS, 0, nodesCount);
      },

      /**
       * Called by webgl renderer when user scales/pans the canvas with nodes.
       */
      updateTransform : function (newTransform) {
          transform = newTransform;
          isCanvasDirty = true;
      },

      /**
       * Called by webgl renderer when user resizes the canvas with nodes.
       */
      updateSize : function (newCanvasWidth, newCanvasHeight) {
          canvasWidth = newCanvasWidth;
          canvasHeight = newCanvasHeight;
          isCanvasDirty = true;
      },

      /**
       * Called by webgl renderer to notify us that the new node was created in the graph
       */
      createNode : function (node) {
          nodes = webglUtils.extendArray(nodes, nodesCount, ATTRIBUTES_PER_PRIMITIVE);
          nodesCount += 1;
      },

      /**
       * Called by webgl renderer to notify us that the node was removed from the graph
       */
      removeNode : function (node) {
          if (nodesCount > 0) { nodesCount -=1; }

          if (node.id < nodesCount && nodesCount > 0) {
              // we do not really delete anything from the buffer.
              // Instead we swap deleted node with the "last" node in the
              // buffer and decrease marker of the "last" node. Gives nice O(1)
              // performance, but make code slightly harder than it could be:
              webglUtils.copyArrayPart(nodes, node.id*ATTRIBUTES_PER_PRIMITIVE, nodesCount*ATTRIBUTES_PER_PRIMITIVE, ATTRIBUTES_PER_PRIMITIVE);
          }
      },

      /**
       * This method is called by webgl renderer when it changes parts of its
       * buffers. We don't use it here, but it's needed by API (see the comment
       * in the removeNode() method)
       */
      replaceProperties : function(replacedNode, newNode) {},
  };
}

