const body = d3.select('body');
const chart = d3.select('#draw-space');
const control = d3.select('#control-space');

var FORCE_ENABLED = true;

d3.csv('isomap_data.csv')
  .then(data => {
    data.forEach(d => {
      d.Year = parseInt(d.Year);
      d.x = parseFloat(d.x);
      d.y = parseFloat(d.y);
    })
    renderChart(data);
  });

function renderChart(data) {
  const svg = chart.append('svg')
                   .attr('id', 'iso-2d-chart');

  svg.append('rect')
     .attr('id', 'iso-2d-chart-bg');

  const xVal = data.map(d => d.x),
        yVal = data.map(d => d.y),
        xMax = Math.max(...xVal),
        xMin = Math.min(...xVal),
        yMax = Math.max(...yVal),
        yMin = Math.min(...yVal);

  const xScale = d3.scaleLinear()
                   .domain([xMin, xMax])
                   .range([50, 450]);

  const yScale = d3.scaleLinear()
                   .domain([yMin, yMax])
                   .range([450, 50]);

  const countries = Array.from(new Set(data.map(d => d.Country)));
  var colors = d3.schemeAccent
                 .slice(0, countries.length+1);

  colors.splice(3, 1);

  const cScale = d3.scaleOrdinal()
                   .domain(countries)
                   .range(colors)

  data.forEach(d => {
    d.x = xScale(d.x);
    d.y = yScale(d.y);
    d.px = d.x;
    d.py = d.y;
    d.fixed = "TRUE";
  })

  const force = d3.forceSimulation()
                  .force('collision', d3.forceCollide().radius(3))
                  .velocityDecay(0.92)
                  .on('tick', () => {
                    d3.selectAll('.data-point')
                      .attr('cx', d => d.x) 
                      .attr('cy', d => d.y);
                  })
                  .stop();

  const legend = control.append('svg') .attr('id', 'legend');
  
  legend.append('rect')
        .attr('id', 'legend-bg');

  const legendItems = legend.selectAll()
                            .data(countries)
                            .enter();

  legendItems.append('text')
             .attr('class', 'legend-item-label')
             .attr('x', 117)
             .attr('y', (d, i) => i * 25 + 17)
             .text(d => d);

  legendItems.append('circle')
             .attr('class', 'legend-item-bar')
             .attr('cx', 145)
             .attr('cy', (d, i) => i * 25 + 13)
             .attr('r', 6)
             .attr('fill', d => cScale(d));

  const years = data.map(d => d.Year),
        maxYear = Math.max(...years),
        minYear = Math.min(...years),
        yearOpt = [...Array(maxYear-minYear+1).keys()].map(d => d+minYear)
                                                      .reverse();

  const yearSelect = control.append('div')
                            .attr('class', 'select-filter')
                            .append('select')
                            .attr('id', 'year-select')
                            .attr('class', 'form-control');
                        
  yearSelect.append('option')
            .attr('value', 'all')
            .text('All')
  
  yearSelect.selectAll('.year-options')
            .data(yearOpt)
            .enter()
            .append('option')
              .attr('value', d => d)
              .text(d => d);
  
  function restart() {
    const y = d3.select('#year-select').property('value');
    var filteredData;

    if (y == 'all') {
      filteredData = data;
    } else {
      filteredData = data.filter(d => d.Year == y);
    }

    filteredData.forEach(d => {
      d.x = d.px;
      d.y = d.py;
    })

    const newPoints = svg.selectAll('.data-point')
                         .data(filteredData)
    
    newPoints.enter()
             .append('circle')
             .attr('class', 'data-point')
             .merge(newPoints)
             .attr('cx', d => d.x)
             .attr('cy', d => d.y)
             .attr('r', 3)
             .attr('fill', d => cScale(d.Country))

    newPoints.exit()
             .remove();
    
    if (FORCE_ENABLED) {
      force.nodes(filteredData)
           .alpha(1)
           .restart();
    }
  };

  yearSelect.on('change', restart);

  const forceSelect = control.append('div')
                             .attr('class', 'select-filter')
                             .append('select')
                             .attr('class', 'form-control');

  forceSelect.append('option')
             .attr('value', 'directed')
             .text('Force Directed');

  forceSelect.append('option')
             .attr('value', 'static')
             .text('Static');

  forceSelect.on('change', function() {
    if (d3.select(this).property('value') === 'static') {
      FORCE_ENABLED = false;
      force.stop();
    } else {
      FORCE_ENABLED = true;
    }
    restart();
  })

  restart();
}
