import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Badge,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Icon,
  Notice,
} from "../components/ui";
import { client } from "../services/client";
import type { LaundryState } from "../hooks/useLaundry";
import { colors } from "../theme";

export function AuthScreen({ state }: { state: LaundryState }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState("");
  const submit = async () => {
    if (
      !email.includes("@") ||
      password.length < 8 ||
      (register && name.trim().length < 2)
    ) {
      setValidation(
        "Geçerli e-posta, en az 8 karakterlik parola ve kayıt için adını gir.",
      );
      return;
    }
    setValidation("");
    await state.act(async () => {
      if (register) {
        const result = await client.signUp(name.trim(), email.trim(), password);
        if (result.needsVerification) {
          state.setMessage(
            "Doğrulama bağlantısını e-postana gönderdik. Bağlantıyı açtıktan sonra giriş yap.",
          );
          setRegister(false);
        }
      } else await client.signIn(email.trim(), password);
    });
  };
  const fillDemo = (role: "owner" | "member" | "pending") => {
    setRegister(false);
    setEmail(`${role}@demo.local`);
    setPassword("demo12345");
    setValidation("");
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        <View style={s.brand}>
          <View style={s.logo}>
            <Icon name="water-outline" size={27} color={colors.white} />
          </View>
          <Text style={s.wordmark}>ÇamaşırSırası</Text>
        </View>
        <View style={s.hero}>
          <Badge text="Zamanın sana kalsın" />
          <Heading>Çamaşır gününü{"\n"}kolaylaştır.</Heading>
          <Body muted>
            Makineni seç, sıranı ayır. Bittiğinde çamaşırlarını al; sıra bir
            sonraki kişiye geçsin.
          </Body>
        </View>
        {client.mode === "demo" && (
          <Notice>
            Sunum modu · Örnek veriler bu cihazda tutulur. Gerçek bir kuruma
            bağlanmaz.
          </Notice>
        )}
        <Card>
          <Heading small>
            {register ? "Hesabını oluştur" : "Tekrar hoş geldin"}
          </Heading>
          <Body muted>
            {register
              ? "Hesabın her alanda ayrı bir üyeliğe sahip olur."
              : "Alanına ve çamaşır sırana devam et."}
          </Body>
          {register && (
            <Field
              label="Ad soyad"
              value={name}
              onChangeText={setName}
              placeholder="Adın ve soyadın"
              textContentType="name"
              autoComplete="name"
            />
          )}
          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            placeholder="ornek@eposta.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
          <Field
            label="Parola"
            value={password}
            onChangeText={setPassword}
            placeholder="En az 8 karakter"
            secureTextEntry
            textContentType={register ? "newPassword" : "password"}
            autoComplete={register ? "new-password" : "current-password"}
            onSubmitEditing={() => void submit()}
          />
          {(validation || state.error) && (
            <Notice error>{validation || state.error}</Notice>
          )}
          {!!state.message && <Notice>{state.message}</Notice>}
          <Button
            label={register ? "Hesap oluştur" : "Giriş yap"}
            busy={state.busy}
            onPress={() => void submit()}
            icon="arrow-forward-outline"
          />
          <Button
            label={register ? "Hesabım var, giriş yap" : "Yeni hesap oluştur"}
            secondary
            disabled={state.busy}
            onPress={() => {
              setRegister(!register);
              state.clearNotice();
              setValidation("");
            }}
          />
        </Card>
        {client.mode === "demo" && (
          <Card>
            <Heading small>Sunum hesapları</Heading>
            <Body muted>
              Bir rol seç; e-posta ve parola doldurulsun. Ardından giriş yap.
            </Body>
            <Button
              label="Üye hesabını doldur"
              secondary
              onPress={() => fillDemo("member")}
              icon="person-outline"
            />
            <Button
              label="Yönetici hesabını doldur"
              secondary
              onPress={() => fillDemo("owner")}
              icon="shield-checkmark-outline"
            />
            <Button
              label="Onay bekleyen hesabı doldur"
              secondary
              onPress={() => fillDemo("pending")}
              icon="time-outline"
            />
          </Card>
        )}
        <Text style={s.footer}>
          Özel alanlar · Yönetici onayı · Ortak kullanım
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  page: {
    padding: 24,
    paddingTop: 38,
    paddingBottom: 40,
    gap: 24,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 11 },
  logo: {
    height: 44,
    width: 44,
    backgroundColor: colors.blue,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  hero: { gap: 16, marginTop: 14 },
  footer: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
});
