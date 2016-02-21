var numNodes = 100;
var numLinks = 100;

var graph;

function getRand() {
  return 1 + Math.floor(Math.random() * numNodes);
}

function addLinks() {
  for (var i = 1; i <= numNodes; i++) {
    if (i === 1) {
      graph.addLink(1, numNodes);
    } else {
      graph.addLink(i, i - 1);
    }
  }
  // graph.addLink(1, 2);
}

function onLoad() {
  graph = Viva.Graph.graph();

  addLinks();

  var graphics = Viva.Graph.View.webglGraphics();

  var renderer = Viva.Graph.View.renderer(graph, {
    graphics: graphics,
    container: document.getElementById('graph-container')
  });
  renderer.run();
}
