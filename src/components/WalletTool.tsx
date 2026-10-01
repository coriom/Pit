import { Providers, Wallet } from "./Wallet";

export default function WalletTool() {
  return (
    <Providers>
      <section className="panel">
        <Wallet />
        <p>
          Balance is read through the connected wallet provider. No signature is
          requested here.
        </p>
      </section>
    </Providers>
  );
}
