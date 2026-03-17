import { signTransaction, setAllowed, getAddress} from "@stellar/freighter-api";
import * as StellarSdk from '@stellar/stellar-sdk';

const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

const checkConnection = async () => {
    return await setAllowed();
}

const retrievePublicKey = async () => {
    const { address } = await getAddress();
    return address;
};

const getBalance = async () => {
    await setAllowed();

    const { address } = await getAddress();

    const account = await server.loadAccount(address);

    const xlm = account.balances.find((balance) => balance.asset_type === "native");

    return xlm ? xlm.balance : "0";
};

const userSignTransaction = async (xdr, network, signWith) => {  
    return await signTransaction(xdr,{
        network,
        accountToSign: signWith,
    });
};

export { checkConnection, retrievePublicKey, getBalance, userSignTransaction };