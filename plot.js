const margin = { top: 50, right: 40, bottom: 50, left: 60 };
const width = 1100 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

const svg = d3.select("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");
const x = d3.scaleLinear().domain([0, 1]).range([0, width]);
const y = d3.scaleLinear().range([height, 0]);

svg.append("g").attr("transform", `translate(0,${height})`).attr("class", "x-axis");
svg.append("g").attr("class", "y-axis");

svg.append("text")
  .attr("text-anchor", "middle")
  .attr("x", width / 2)
  .attr("y", height + margin.bottom - 5)
  .attr("class", "axis-label x-label")
  .text("Progress Through Surgery");

const yLabel = svg.append("text")
  .attr("text-anchor", "middle")
  .attr("transform", `rotate(-90)`)
  .attr("x", -height / 2)
  .attr("y", -margin.left + 15)
  .attr("class", "axis-label y-label");

const xAxis = d3.axisBottom(x).tickFormat(d3.format(".0%"));
const yAxis = d3.axisLeft(y);
const color = d3.scaleOrdinal(d3.schemeCategory10);

const hoverLine = svg.append("line")
  .attr("class", "hover-line")
  .attr("stroke", "#aaa")
  .attr("stroke-width", 1)
  .attr("y1", 0)
  .attr("y2", height)
  .style("opacity", 0);

const hoverCircle = svg.append("circle")
  .attr("class", "hover-circle")
  .attr("r", 4)
  .attr("fill", "black")
  .style("opacity", 0);

d3.csv("data/vitals_long_format_10s.csv", d3.autoType).then(data => {
  const vitalOptions = Array.from(new Set(data.map(d => d.signal)));
  const groupOptions = ["optype", "emop"];

  const vitalSelect = d3.select("#vitalSelect")
  .selectAll("option")
  .data(vitalOptions)
  .enter().append("option")
  .text(d => d.replace(/_/g, " ").toUpperCase())
  .attr("value", d => d);

  d3.select("#groupSelect").selectAll("option")
    .data(groupOptions).enter().append("option")
    .text(d => d === "optype" ? "Surgery Type" : "Emergency Status")
    .attr("value", d => d);

  let activeGroups = new Set();

  function renderZones(selectedVital, y) {
    svg.selectAll(".danger-zone").remove();
    const yMin = y.domain()[0], yMax = y.domain()[1];
    let zones = [];

    if (selectedVital === "map") {
      zones = [
        { label: "Low MAP (<60)", min: Math.max(0, yMin), max: Math.min(60, yMax), color: "#fdd" },
        { label: "High MAP (>120)", min: Math.max(120, yMin), max: yMax, color: "#ffe5b4" }
      ];
    } else if (selectedVital === "hr") {
      zones = [
        { label: "Bradycardia (<50)", min: Math.max(0, yMin), max: Math.min(50, yMax), color: "#fdd" },
        { label: "Tachycardia (>100)", min: Math.max(100, yMin), max: yMax, color: "#ffe5b4" }
      ];
    } else if (selectedVital === "spo2") {
      zones = [
        { label: "Low SpO₂ (<90%)", min: Math.max(0, yMin), max: Math.min(90, yMax), color: "#fdd" }
      ];
    } else if (selectedVital === "stability_index") {
      zones = [
        { label: "Danger Zone (<0.5)", min: Math.max(0, yMin), max: Math.min(0.5, yMax), color: "#fdd" },
        { label: "Caution Zone (0.5–0.75)", min: Math.max(0.5, yMin), max: Math.min(0.75, yMax), color: "#ffe5b4" }
      ];
    }

    zones.forEach(zone => {
      if (zone.min < zone.max) {
        svg.append("rect")
          .attr("class", "danger-zone")
          .attr("x", 0).attr("width", width)
          .attr("y", y(zone.max))
          .attr("height", y(zone.min) - y(zone.max))
          .attr("fill", zone.color).attr("opacity", 0.2);
      }
    });
  }

  function updateChart() {
    const selectedVital = d3.select("#vitalSelect").property("value");
    const selectedGroup = d3.select("#groupSelect").property("value");
    const filtered = data.filter(d => d.signal === selectedVital);
    const nested = d3.groups(filtered, d => d[selectedGroup]);

    const label = selectedVital === "map" ? "MAP (mmHg)"
                : selectedVital === "hr" ? "Heart Rate (beats/min)"
                : selectedVital === "spo2" ? "SpO₂ (%)"
                : selectedVital === "stability_index" ? "Stability Index"
                : "Vital Value";
    yLabel.text(label);
    
    
    const summary = nested.map(([key, values]) => {
      const binSize = 0.01;
      const binned = d3.groups(values, d => Math.round(d.norm_time / binSize) * binSize)
        .map(([t, pts]) => {
          const v = pts.map(p => p.value);
          return {
            norm_time: +t,
            mean: d3.mean(v),
            sd: d3.deviation(v)
          };
        });
      return { key, values: binned.sort((a, b) => a.norm_time - b.norm_time) };
    });

    const visible = summary.filter(d => activeGroups.size === 0 || activeGroups.has(d.key));

    if (selectedVital === "map") y.domain([40, 130]);
    else if (selectedVital === "hr") y.domain([40, 120]);
    else if (selectedVital === "spo2") y.domain([88, 100]);
    else {
      y.domain([
        d3.min(visible, s => d3.min(s.values, d => d.mean - (d.sd || 0))),
        d3.max(visible, s => d3.max(s.values, d => d.mean + (d.sd || 0)))
      ]);
    }

    renderZones(selectedVital, y);
    svg.select(".x-axis").call(xAxis);
    svg.select(".y-axis").call(yAxis);

    const line = d3.line()
      .x(d => x(d.norm_time))
      .y(d => y(d.mean))
      .curve(d3.curveMonotoneX);

    svg.selectAll(".line").data(visible, d => d.key)
      .join("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", d => color(d.key))
      .attr("stroke-width", 2)
      .attr("d", d => line(d.values))
      .style("pointer-events", "visibleStroke")
      .on("mousemove", function (event, d) {
        const [xCoord] = d3.pointer(event);
        const timeAtCursor = x.invert(xCoord);
        const validPoints = d.values.filter(pt => pt.mean != null);
        if (validPoints.length === 0) return;

        if (validPoints.length === 0) return;

        const closest = validPoints.reduce((a, b) =>
          Math.abs(b.norm_time - timeAtCursor) < Math.abs(a.norm_time - timeAtCursor) ? b : a, validPoints[0]);
        const cx = x(closest.norm_time);
        const cy = y(closest.mean);

        hoverLine.attr("x1", cx).attr("x2", cx).style("opacity", 1);
        hoverCircle.attr("cx", cx).attr("cy", cy).style("opacity", 1);

        tooltip
        .style("opacity", 1)
        .html(`
          <strong>${selectedVital.toUpperCase()}</strong><br>
          Group: ${d.key}<br>
          Time: ${(closest.norm_time * 100).toFixed(1)}%<br>
          Mean: ${closest.mean?.toFixed(1) ?? "N/A"}<br>
          SD: ${closest.sd?.toFixed(1) ?? "N/A"}<br>
          `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", () => {
        tooltip.style("opacity", 0);
        hoverLine.style("opacity", 0);
        hoverCircle.style("opacity", 0);
      });

    const zoneLegend = [];
    if (selectedVital === "map") {
      zoneLegend.push(
        { label: "Low MAP (<60)", color: "#fdd" },
        { label: "High MAP (>120)", color: "#ffe5b4" }
      );
    } else if (selectedVital === "hr") {
      zoneLegend.push(
        { label: "Bradycardia (<50)", color: "#fdd" },
        { label: "Tachycardia (>100)", color: "#ffe5b4" }
      );
    } else if (selectedVital === "spo2") {
      zoneLegend.push({ label: "Low SpO₂ (<90%)", color: "#fdd" });
    } else if (selectedVital === "stability_index") {
      zoneLegend.push(
        { label: "Danger Zone (<0.5)", color: "#fdd" },
        { label: "Caution Zone (0.5–0.75)", color: "#ffe5b4" }
      );
    }

    const surgeryKeys = summary.map(d => ({ label: d.key, color: color(d.key) }));
    const fullLegend = [...zoneLegend, ...surgeryKeys];

    const legendContainer = d3.select("#legend");
    legendContainer.html("");
    const legendItems = legendContainer.selectAll("div")
      .data(fullLegend)
      .enter().append("div")
      .attr("class", "legend-item")
      .style("cursor", "pointer")
      .style("opacity", d => activeGroups.size === 0 || activeGroups.has(d.label) ? 1 : 0.3)
      .on("click", (event, d) => {
        if (zoneLegend.some(z => z.label === d.label)) return;
        if (activeGroups.has(d.label)) activeGroups.delete(d.label);
        else activeGroups.add(d.label);
        updateChart();
      })
      .on("mouseover", (event, d) => {
        if (!zoneLegend.some(z => z.label === d.label)) {
          svg.selectAll(".line").style("opacity", l => l.key === d.label ? 1 : 0.1);
        }
      })
      .on("mouseout", () => {
        svg.selectAll(".line").style("opacity", 1);
      });

    legendItems.append("span")
      .attr("class", "legend-color")
      .style("background-color", d => d.color);

    legendItems.append("span")
      .attr("class", "legend-label")
      .text(d => d.label)
      .style("white-space", "normal")
      .style("word-break", "break-word");
  }

  d3.select("#vitalSelect").on("change", updateChart);
  d3.select("#groupSelect").on("change", updateChart);
  d3.select("#vitalSelect").property("value", "stability_index");
  d3.select("#groupSelect").property("value", "optype");
  updateChart();
});
