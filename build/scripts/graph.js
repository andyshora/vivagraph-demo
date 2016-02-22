"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var NUM_NODES = 500;
var NUM_LINKS = 10;
var NUM_ACTIVE_NODES = 50;
var NODE_COLOR = 0xff00ff; // hex rrggbb
var NODE_SIZE = 16;

var COLORS = [0x1f77b4ff, 0xaec7e8ff, 0xff7f0eff, 0xffbb78ff, 0x2ca02cff, 0x98df8aff, 0xd62728ff, 0xff9896ff, 0x9467bdff, 0xc5b0d5ff, 0x8c564bff, 0xc49c94ff, 0xe377c2ff, 0xf7b6d2ff, 0x7f7f7fff, 0xc7c7c7ff, 0xbcbd22ff, 0xdbdb8dff, 0x17becfff, 0x9edae5ff];

var graph, layout, renderer, processingElement, container, vertexShader, fragmentShader;

var Utils = function () {
  function Utils() {
    _classCallCheck(this, Utils);
  }

  _createClass(Utils, null, [{
    key: 'getRand',
    value: function getRand() {
      var min = arguments.length <= 0 || arguments[0] === undefined ? 1 : arguments[0];
      var max = arguments.length <= 1 || arguments[1] === undefined ? NUM_NODES : arguments[1];

      return min + Math.floor(Math.random() * max);
    }
  }]);

  return Utils;
}();

var QBCommGraph = function QBCommGraph() {
  _classCallCheck(this, QBCommGraph);
};

function addLinks() {
  for (var i = 1; i <= NUM_NODES; i++) {

    graph.addNode(i);
    /*if (i === 1) {
      graph.addLink(1, NUM_NODES);
    } else {
      graph.addLink(i, i - 1);
    }*/
  }

  for (var i = 1; i <= NUM_ACTIVE_NODES; i++) {
    var from = i;

    for (var j = 1; j <= NUM_LINKS; j++) {

      var to = Utils.getRand();
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

function onResizeHandler() {
  if (renderer) {
    renderer.reset();
  }
}

function onLoad() {

  processingElement = document.getElementById('log');
  container = document.getElementById('graph-container');
  vertexShader = document.getElementById('vertex-shader').innerHTML;
  fragmentShader = document.getElementById('fragment-shader').innerHTML;

  graph = Viva.Graph.graph();

  layout = Viva.Graph.Layout.forceDirected(graph, {
    springLength: 100,
    springCoeff: 0.0001,
    dragCoeff: 0.05,
    gravity: -1.5,
    theta: 1
  });

  addLinks();

  // we need to compute layout, but we don't want to freeze the browser
  precompute(1000, renderGraph);

  $('#reset').click(function () {
    renderer.reset();
  });

  window.addEventListener('resize', onResizeHandler);
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
  graphics.node(function (node) {
    return new WebglCircle(NODE_SIZE, NODE_COLOR);
  }).link(function (link) {
    return Viva.Graph.View.webglLine(COLORS[Math.random() * COLORS.length << 0]);
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
  var ATTRIBUTES_PER_PRIMITIVE = 4;

  var program,
      gl,
      buffer,
      locations,
      utils,
      webglUtils,
      nodes = new Float32Array(64),
      nodesCount = 0,
      canvasWidth,
      canvasHeight,
      transform,
      isCanvasDirty;

  return {
    /**
     * Called by webgl renderer to load the shader into gl context.
     */
    load: function load(glContext) {
      gl = glContext;
      webglUtils = Viva.Graph.webgl(glContext);
      program = webglUtils.createProgram(vertexShader, fragmentShader);
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
    position: function position(nodeUI, pos) {
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
    render: function render() {
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
    updateTransform: function updateTransform(newTransform) {
      transform = newTransform;
      isCanvasDirty = true;
    },

    /**
     * Called by webgl renderer when user resizes the canvas with nodes.
     */
    updateSize: function updateSize(newCanvasWidth, newCanvasHeight) {
      canvasWidth = newCanvasWidth;
      canvasHeight = newCanvasHeight;
      isCanvasDirty = true;
    },

    /**
     * Called by webgl renderer to notify us that the new node was created in the graph
     */
    createNode: function createNode(node) {
      nodes = webglUtils.extendArray(nodes, nodesCount, ATTRIBUTES_PER_PRIMITIVE);
      nodesCount += 1;
    },

    /**
     * Called by webgl renderer to notify us that the node was removed from the graph
     */
    removeNode: function removeNode(node) {
      if (nodesCount > 0) {
        nodesCount -= 1;
      }

      if (node.id < nodesCount && nodesCount > 0) {
        // we do not really delete anything from the buffer.
        // Instead we swap deleted node with the "last" node in the
        // buffer and decrease marker of the "last" node. Gives nice O(1)
        // performance, but make code slightly harder than it could be:
        webglUtils.copyArrayPart(nodes, node.id * ATTRIBUTES_PER_PRIMITIVE, nodesCount * ATTRIBUTES_PER_PRIMITIVE, ATTRIBUTES_PER_PRIMITIVE);
      }
    },

    /**
     * This method is called by webgl renderer when it changes parts of its
     * buffers. We don't use it here, but it's needed by API (see the comment
     * in the removeNode() method)
     */
    replaceProperties: function replaceProperties(replacedNode, newNode) {}
  };
}