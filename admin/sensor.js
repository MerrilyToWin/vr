/**
 * SYNOVA Admin Sensor Monitoring Controller
 * Maps incoming mobile device raw vector fields.
 */

window.adminSensor = {
  update(accel) {
    if (!accel) return;

    // Map vector points to sensor coordinates logs
    this.setVal('sensor-acc-x', accel.x || '0.00');
    this.setVal('sensor-acc-y', accel.y || '0.00');
    this.setVal('sensor-acc-z', accel.z || '0.00');
    this.setVal('sensor-acc-mag', accel.magnitude || '0.00');
    this.setVal('sensor-gyro', `${accel.gyroX || '0.00'} / ${accel.gyroY || '0.00'} / ${accel.gyroZ || '0.00'}`);
    this.setVal('sensor-orientation', `${accel.tilt || '0.00'} / ${accel.beta || '0.00'} / ${accel.gamma || '0.00'}`);
    this.setVal('sensor-source', accel.source || 'movement');

    // Trigger waveform chart update
    if (window.adminCharts) {
      window.adminCharts.pushWaveform(
        parseFloat(accel.magnitude) || 9.8,
        parseFloat(accel.filtered) || 9.8
      );
    }
  },

  setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  },

  clear() {
    this.setVal('sensor-acc-x', '0.00');
    this.setVal('sensor-acc-y', '0.00');
    this.setVal('sensor-acc-z', '0.00');
    this.setVal('sensor-acc-mag', '0.00');
    this.setVal('sensor-gyro', '0.00 / 0.00 / 0.00');
    this.setVal('sensor-orientation', '0.00 / 0.00 / 0.00');
    this.setVal('sensor-source', 'movement');
  }
};
