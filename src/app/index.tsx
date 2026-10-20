import Slider from '@react-native-community/slider';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { Button, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

// 1. Google Apps Script Web App Endpoint
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxfA8ZqY-I_bwsIrxuvhZ58LgjIjc5ZZm7SqyCpWtwHgY2B_Kzmo4Bp_r8SVsoOs44/exec';

export default function App() {
  useKeepAwake(); // Stops the screen from sleeping while app is open

  const [isOn, setIsOn] = useState(false);
  const [level, setLevel] = useState(1);
  const originalBrightness = useRef<number | null>(null);

  // Request permissions and store original device brightness
  useEffect(() => {
    (async () => {
      const { status } = await Brightness.requestPermissionsAsync();
      if (status === 'granted') {
        originalBrightness.current = await Brightness.getBrightnessAsync();
      }
    })();
  }, []);

  // Update screen brightness on toggle/slider change
  useEffect(() => {
    (async () => {
      try {
        if (isOn) {
          await Brightness.setBrightnessAsync(level);
        } else if (originalBrightness.current !== null) {
          await Brightness.setBrightnessAsync(originalBrightness.current);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [isOn, level]);

  // 2. Fetch function to post payload to Google Sheets
  const sendData = async (payload: object) => {
    try {
      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      console.log('Response:', result);
    } catch (error) {
      console.error('Error sending data:', error);
    }
  };

  // 3. UI JSX layout (All React components must live inside return)
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Text style={styles.title}>Brightness Controller</Text>

      <Pressable 
        style={[styles.toggleBtn, isOn && styles.toggleBtnActive]} 
        onPress={() => setIsOn(!isOn)}
      >
        <Text style={styles.toggleText}>{isOn ? 'LIGHT ON' : 'LIGHT OFF'}</Text>
      </Pressable>

      <View style={styles.sliderBox}>
        <Text style={styles.label}>Brightness: {Math.round(level * 100)}%</Text>
        <Slider
          style={{ width: 250, height: 40 }}
          minimumValue={0}
          maximumValue={1}
          value={level}
          onValueChange={setLevel}
          minimumTrackTintColor="#007AFF"
          maximumTrackTintColor="#555"
        />
      </View>

      {/* Button placed properly inside JSX */}
      <View style={styles.actionBox}>
        <Button 
          title="Save State to Sheets" 
          onPress={() => sendData({ status: isOn, brightness: level })} 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  toggleBtn: {
    backgroundColor: '#333',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 30,
  },
  toggleBtnActive: {
    backgroundColor: '#007AFF',
  },
  toggleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sliderBox: {
    alignItems: 'center',
    marginBottom: 40,
  },
  label: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 10,
  },
  actionBox: {
    marginTop: 10,
  },
});