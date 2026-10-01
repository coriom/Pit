import { Export } from "./Export";
import { FillRecorder } from "./FillRecorder";
import { Providers, Wallet } from "./Wallet";

export default function AccountingTool() {
  return (
    <Providers>
      <section className="panel">
        <Wallet />
        <FillRecorder />
        <Export />
      </section>
    </Providers>
  );
}
