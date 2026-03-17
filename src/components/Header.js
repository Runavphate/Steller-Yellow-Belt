import React, {useState} from "react";
import { checkConnection, retrievePublicKey, getBalance } from "./Freighter";
import TransactionHistory from "./TransactionHistory";

const Header = () => {
    const [connected, setConnected] = useState(false);
    const [publicKey, setPublicKey] = useState("");
    const [balance, setBalance] = useState("0");

    const  connectWallet = async () => {
        try {
            const allowed = await checkConnection();

            if (!allowed) return alert("Please allow access to Freighter in order to connect your wallet.");
            
            const key = await retrievePublicKey();
            const bal = await getBalance();

            setPublicKey(key);
            setBalance(Number(bal).toFixed(2));
            setConnected(true);
        } catch (error) {
            console.log(error);
        }
    };
     return (
            <div className="min-h-screen bg-slate-900 text-white p-6">
                <div className="text-2xl font-bold mb-4">Stellar DApp</div>
                <div className="space-y-3">
                    {publicKey && (
                        <>
                          <div>{`${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`}</div>

                            <div>Balance: {balance} XLM</div>

                            <TransactionHistory publicKey={publicKey} limit={10} />
                        </>
                    )}

                    <button
                        onClick={connectWallet}
                        disabled={connected}
                        className={connected ? "px-4 py-2 rounded bg-gray-400 text-white" : "px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"}
                    >
                        {connected ? "Connected" : "Connect Wallet"}
                    </button>
                </div>
            </div>
     );
};

export default Header;
    