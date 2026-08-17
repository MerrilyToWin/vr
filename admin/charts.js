/**
 * SYNOVA Admin Charts Controller
 * Manages Chart.js rendering and dynamic buffers.
 */

window.adminCharts = {
  fpsChart: null,
  waveformChart: null,
  cardioChart: null,
  accuracyChart: null,

  init() {
    this.initFPSChart();
    this.initWaveformChart();
    this.initCardioChart();
    this.initAccuracyChart();
  },

  // 1. FPS History Line Chart
  initFPSChart() {
    const ctx = document.getElementById('chart-fps-history')?.getContext('2d');
    if (!ctx) return;

    // Buffer: last 15 seconds
    const labels = Array(15).fill('');
    const data = Array(15).fill(60);

    this.fpsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Frame Rate (FPS)',
          data: data,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: false },
          y: { min: 0, max: 70, grid: { color: 'rgba(0,0,0,0.03)' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  },

  // 2. High-Frequency Sensor Waveform (Line graph)
  initWaveformChart() {
    const ctx = document.getElementById('chart-sensor-waveform')?.getContext('2d');
    if (!ctx) return;

    // Buffer: last 30 samples
    const labels = Array(35).fill('');
    const magData = Array(35).fill(9.8);
    const filterData = Array(35).fill(9.8);

    this.waveformChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Raw Accel Magnitude',
            data: magData,
            borderColor: 'rgba(59, 130, 246, 0.4)',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Filtered Accel',
            data: filterData,
            borderColor: '#22C55E',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: false },
          y: { min: 2, max: 20, grid: { color: 'rgba(0,0,0,0.03)' } }
        },
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 9 } } }
        }
      }
    });
  },

  // 3. Cardio Bar Chart (Steps vs Calories)
  initCardioChart() {
    const ctx = document.getElementById('chart-reports-cardio')?.getContext('2d');
    if (!ctx) return;

    this.cardioChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Steps Count', 'Distance (m)', 'Calories (kcal * 10)'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: [
            'rgba(34, 197, 94, 0.75)',  // Green
            'rgba(251, 191, 36, 0.75)',  // Yellow
            'rgba(239, 68, 68, 0.75)'   // Red
          ],
          borderWidth: 0,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  },

  // 4. Accuracy Doughnut Chart
  initAccuracyChart() {
    const ctx = document.getElementById('chart-reports-accuracy')?.getContext('2d');
    if (!ctx) return;

    this.accuracyChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Balls Caught', 'Balls Missed'],
        datasets: [{
          data: [0, 0],
          backgroundColor: [
            'rgba(37, 99, 235, 0.75)',  // Blue
            'rgba(100, 116, 139, 0.2)'  // Gray
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
        },
        cutout: '65%'
      }
    });
  },

  // Add new FPS value to dataset
  pushFPS(fps) {
    if (!this.fpsChart) return;
    const data = this.fpsChart.data.datasets[0].data;
    data.push(fps);
    data.shift();
    this.fpsChart.update('none'); // silent update
  },

  // Shift vector magnitude values into waveform dataset
  pushWaveform(mag, filtered) {
    if (!this.waveformChart) return;
    const magDataset = this.waveformChart.data.datasets[0].data;
    const filterDataset = this.waveformChart.data.datasets[1].data;
    
    magDataset.push(mag);
    magDataset.shift();
    
    filterDataset.push(filtered);
    filterDataset.shift();
    
    this.waveformChart.update('none');
  },

  // Update cumulative graphs
  updateCardio(steps, distance, calories) {
    if (!this.cardioChart) return;
    this.cardioChart.data.datasets[0].data = [
      steps,
      distance,
      calories * 10
    ];
    this.cardioChart.update();
  },

  updateAccuracy(caught, missed) {
    if (!this.accuracyChart) return;
    this.accuracyChart.data.datasets[0].data = [caught, missed];
    this.accuracyChart.update();
  },

  // Reset all charts
  clear() {
    if (this.fpsChart) {
      this.fpsChart.data.datasets[0].data = Array(15).fill(60);
      this.fpsChart.update();
    }
    
    if (this.waveformChart) {
      this.waveformChart.data.datasets[0].data = Array(35).fill(9.8);
      this.waveformChart.data.datasets[1].data = Array(35).fill(9.8);
      this.waveformChart.update();
    }

    if (this.cardioChart) {
      this.cardioChart.data.datasets[0].data = [0, 0, 0];
      this.cardioChart.update();
    }

    if (this.accuracyChart) {
      this.accuracyChart.data.datasets[0].data = [0, 0];
      this.accuracyChart.update();
    }
  }
};
