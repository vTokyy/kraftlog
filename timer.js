/* ===== Kraftlog — Signal-Primitiven für den Pausen-Timer =====
 * Die Countdown-Logik lebt in app.js (rein timestampbasiert).
 * Hier: Web-Audio-Piepton (Vordergrund), Audio-Element-Piepton (läuft auch im
 * Hintergrund, solange die Audio-Session gehalten wird), Vibration sowie der
 * Hintergrund-Trick: Während der Pause läuft eine (stumme) Audio-Schleife —
 * sie hält die App auch bei gesperrtem Handy/anderer App am Leben, damit
 * Ton und Benachrichtigung am Pausenende ausgelöst werden können.
 * iOS-Regel: Audio muss in einer Nutzer-Geste entsperrt werden (erster Satz-Haken).
 */
window.KraftlogTimer = (function () {
  'use strict';

  var BEEP_WAV = 'data:audio/wav;base64,UklGRkQcAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSAcAAB/xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V/OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX84Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh/xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4fsXr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V/OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4ul/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V/OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX84Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh/xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4fsXr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V/OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4ul/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V/OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX84Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh/xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4f8Xr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V+OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4um/eDMRIl2n3+vFfjgSHlag2+zKhT4UG1Ca1+zPjEQWGEqT0+3Tk0oYFkSMz+zXmlAbFD6FyuzboFYeEjh+xevfp10iETN4v+nirWMmES5xuefls2oqESpqs+XnuXEuESZjreLpv3gzESJdp9/rxX44Eh5WoNvsyoU+FBtQmtfsz4xEFhhKk9Pt05NKGBZEjM/s15pQGxQ+hcrs26BWHhI4fsXr36ddIhEzeL/p4q1jJhEucbnn5bNqKhEqarPl57lxLhEmY63i6b94MxEiXaff68V/OBIeVqDb7MqFPhQbUJrX7M+MRBYYSpPT7dOTShgWRIzP7NeaUBsUPoXK7NugVh4SOH/F69+nXSIRM3i/6eKtYyYRLnG55+WzaioRKmqz5ee5cS4RJmOt4ul/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f38=';
  var STILLE_WAV = 'data:audio/wav;base64,UklGRvQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdAHAAB/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/fw==';

  var ctx = null;
  var beepEl = null;
  var stilleEl = null;

  function ensureEls() {
    if (beepEl) return;
    try {
      beepEl = new Audio(BEEP_WAV);
      beepEl.setAttribute('playsinline', '');
      stilleEl = new Audio(STILLE_WAV);
      stilleEl.setAttribute('playsinline', '');
      stilleEl.loop = true;
    } catch (e) { beepEl = null; stilleEl = null; }
  }

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    }
    return ctx;
  }

  /* In einer Nutzer-Geste aufrufen (erster Satz-Haken): entsperrt WebAudio UND die Audio-Elemente. */
  function unlock() {
    var c = ensureCtx();
    if (c) {
      try {
        if (c.state === 'suspended') c.resume();
        var buf = c.createBuffer(1, 1, 22050);
        var src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.start(0);
      } catch (e) { }
    }
    ensureEls();
    if (beepEl) {
      try {
        beepEl.muted = true;
        var p = beepEl.play();
        if (p && p.then) {
          p.then(function () { beepEl.pause(); beepEl.currentTime = 0; beepEl.muted = false; })
            .catch(function () { beepEl.muted = false; });
        }
      } catch (e) { try { beepEl.muted = false; } catch (e2) { } }
    }
  }

  /* 3 x 880-Hz-Piepton über WebAudio (Vordergrund). */
  function beep() {
    var c = ensureCtx();
    if (!c || c.state !== 'running') return false;
    try {
      var t = c.currentTime + 0.02;
      for (var i = 0; i < 3; i++) {
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.18);
        t += 0.3;
      }
      return true;
    } catch (e) { return false; }
  }

  /* Piepton über das Audio-Element — funktioniert auch im Hintergrund/gesperrt,
     solange die stille Schleife die Audio-Session hält. */
  function beepLaut() {
    ensureEls();
    if (!beepEl) return false;
    try {
      beepEl.currentTime = 0;
      var p = beepEl.play();
      if (p && p.catch) p.catch(function () { });
      return true;
    } catch (e) { return false; }
  }

  /* Pause beginnt: stille Schleife starten (haelt die App im Hintergrund wach). */
  function restStart() {
    ensureEls();
    if (!stilleEl) return;
    try {
      var p = stilleEl.play();
      if (p && p.catch) p.catch(function () { });
      if ('mediaSession' in navigator && window.MediaMetadata) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({ title: 'Pausen-Timer laeuft', artist: 'Kraftlog' });
        } catch (e) { }
      }
    } catch (e) { }
  }

  /* Pause beendet: Schleife stoppen. */
  function restStop() {
    if (!stilleEl) return;
    try { stilleEl.pause(); stilleEl.currentTime = 0; } catch (e) { }
  }

  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { }
  }

  return { unlock: unlock, beep: beep, beepLaut: beepLaut, restStart: restStart, restStop: restStop, vibrate: vibrate };
})();
