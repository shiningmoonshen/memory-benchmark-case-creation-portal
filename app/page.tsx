import CharacterSelect from "./components/CharacterSelect";

export default function HomePage() {
  return <CharacterSelect passcodeRequired={!!process.env.APP_PASSCODE} />;
}
